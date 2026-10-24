import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import mongoose from 'mongoose';
import Conversation from '../models/Conversation.js';
import { getUserStore } from './userStore.js';
import { dataDir } from './paths.js';

// Where saved chats live. Like the user store there are two, and the one in use follows it:
// MongoDB when accounts are in MongoDB, a local file (data/history.json) otherwise.
// Both expose the same calls. Every call takes the signed-in user's id and can only see that
// user's chats: a chat that belongs to someone else behaves exactly like one that is not there.
//   create(userId)                  -> summary, throws TooManyChatsError
//   append(userId, id, entries)     -> summary or null; throws ChatFullError
//   list(userId)                    -> summaries, newest activity first
//   get(userId, id)                 -> summary + messages, or null
//   remove(userId, id)              -> true if it existed
//   removeAll(userId)               -> how many were deleted
// A summary is { id, startedAt, updatedAt, messageCount, preview }.

export const MAX_MESSAGES = 500; // per chat
export const MAX_CHATS = 500;    // per account
const PREVIEW_LENGTH = 100;

export class ChatFullError extends Error {
  constructor() {
    super('This chat is full. Start a new check-in to keep saving.');
    this.name = 'ChatFullError';
  }
}

export class TooManyChatsError extends Error {
  constructor() {
    super(`You have reached the limit of ${MAX_CHATS} saved chats. Delete some to save more.`);
    this.name = 'TooManyChatsError';
  }
}

// What a chat is called in the list: the first thing the person said that actually says
// something. Openers such as "Continue", "new", "yes" or a bare number are skipped, so the list
// shows what each chat was about. If everything said was an opener, the first one is used.
const OPENER = /^(continue|new|yes|no|ok|okay|skip|back|menu|exit|hi|hello|hey|not yet|[0-9]+[.)]?|हुन्छ|होइन|नयाँ|नमस्ते)$/i;
const previewSource = messages => {
  const said = messages.filter(message => message.role === 'user');
  return (said.find(message => !OPENER.test(message.text.trim())) ?? said[0])?.text ?? '';
};
const makePreview = text => text.trim().replace(/\s+/g, ' ').slice(0, PREVIEW_LENGTH);
const iso = value => new Date(value).toISOString();

const summaryOf = chat => ({
  id: String(chat.id ?? chat._id),
  startedAt: iso(chat.startedAt),
  updatedAt: iso(chat.updatedAt),
  messageCount: chat.messageCount,
  preview: chat.preview
});

const withMessages = chat => ({
  ...summaryOf(chat),
  messages: chat.messages.map(message => ({ role: message.role, text: message.text, at: iso(message.at) }))
});

const mongoHistory = {
  kind: 'mongo',

  async create(userId) {
    if (await Conversation.countDocuments({ userId }) >= MAX_CHATS) throw new TooManyChatsError();
    return summaryOf(await Conversation.create({ userId }));
  },

  async append(userId, id, entries) {
    if (!mongoose.isValidObjectId(id)) return null;
    const now = new Date();
    // The count check and the push are one step, so two requests cannot both squeeze past the limit
    const chat = await Conversation.findOneAndUpdate(
      { _id: id, userId, messageCount: { $lte: MAX_MESSAGES - entries.length } },
      {
        $push: { messages: { $each: entries.map(entry => ({ role: entry.role, text: entry.text, at: now })) } },
        $inc: { messageCount: entries.length },
        $set: { updatedAt: now }
      },
      { new: true }
    );
    if (!chat) {
      if (await Conversation.exists({ _id: id, userId })) throw new ChatFullError();
      return null;
    }
    const preview = makePreview(previewSource(chat.messages));
    if (preview && preview !== chat.preview) {
      await Conversation.updateOne({ _id: id, userId }, { $set: { preview } });
      chat.preview = preview;
    }
    return summaryOf(chat);
  },

  async list(userId) {
    const chats = await Conversation.find({ userId }).select('-messages').sort({ updatedAt: -1 }).limit(MAX_CHATS).lean();
    return chats.map(summaryOf);
  },

  async get(userId, id) {
    if (!mongoose.isValidObjectId(id)) return null;
    const chat = await Conversation.findOne({ _id: id, userId }).lean();
    return chat ? withMessages(chat) : null;
  },

  async remove(userId, id) {
    if (!mongoose.isValidObjectId(id)) return false;
    return (await Conversation.deleteOne({ _id: id, userId })).deletedCount > 0;
  },

  async removeAll(userId) {
    return (await Conversation.deleteMany({ userId })).deletedCount;
  }
};

function createFileHistory() {
  const file = path.join(dataDir(), 'history.json');
  let db = null;

  function load() {
    if (db) return db;
    try {
      db = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
      db = { chats: [] };
    }
    return db;
  }

  function save() {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp`;
    // Chats are private: readable by the owner of the file only
    fs.writeFileSync(tmp, JSON.stringify(db, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
  }

  const owned = (userId, id) => load().chats.find(chat => chat.userId === userId && chat.id === id);

  return {
    kind: 'file',

    async create(userId) {
      const { chats } = load();
      if (chats.filter(chat => chat.userId === userId).length >= MAX_CHATS) throw new TooManyChatsError();
      const now = new Date().toISOString();
      const chat = { id: randomUUID(), userId, startedAt: now, updatedAt: now, messageCount: 0, preview: '', messages: [] };
      chats.push(chat);
      save();
      return summaryOf(chat);
    },

    async append(userId, id, entries) {
      const chat = owned(userId, id);
      if (!chat) return null;
      if (chat.messages.length + entries.length > MAX_MESSAGES) throw new ChatFullError();
      const now = new Date().toISOString();
      for (const entry of entries) chat.messages.push({ role: entry.role, text: entry.text, at: now });
      chat.messageCount = chat.messages.length;
      chat.updatedAt = now;
      chat.preview = makePreview(previewSource(chat.messages));
      save();
      return summaryOf(chat);
    },

    async list(userId) {
      return load().chats
        .filter(chat => chat.userId === userId)
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
        .map(summaryOf);
    },

    async get(userId, id) {
      const chat = owned(userId, id);
      return chat ? withMessages(chat) : null;
    },

    async remove(userId, id) {
      const data = load();
      const before = data.chats.length;
      data.chats = data.chats.filter(chat => !(chat.userId === userId && chat.id === id));
      if (data.chats.length === before) return false;
      save();
      return true;
    },

    async removeAll(userId) {
      const data = load();
      const before = data.chats.length;
      data.chats = data.chats.filter(chat => chat.userId !== userId);
      if (data.chats.length !== before) save();
      return before - data.chats.length;
    }
  };
}

// Follows the user store: rebuilt whenever that is (a restart, or a test starting afresh)
let cached = { forStore: null, history: null };

export function getHistoryStore() {
  const users = getUserStore();
  if (!users) return null;
  if (cached.forStore !== users) {
    cached = { forStore: users, history: users.kind === 'mongo' ? mongoHistory : createFileHistory() };
  }
  return cached.history;
}
