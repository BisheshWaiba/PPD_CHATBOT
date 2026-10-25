import express from 'express';
import { protect } from '../middleware/auth.js';
import { getHistoryStore, ChatFullError, TooManyChatsError, retentionDays } from '../util/historyStore.js';
import { validateHistoryEntries } from '../util/validation.js';
import { RateLimiter } from '../util/rateLimit.js';

const router = express.Router();

// Saved chats are private: only signed-in users, and each only ever sees their own
router.use(protect);

// Saving happens in the background while someone chats, so this is generous. It only stops
// a runaway script. Tests lower it with HISTORY_RATE_LIMIT.
const writesByUser = new RateLimiter({
  max: Number(process.env.HISTORY_RATE_LIMIT) || 120,
  windowMs: 60 * 1000
});

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const wrap = handler => (req, res, next) => handler(req, res, next).catch(next);

// A chat that is not yours looks exactly like one that does not exist
const notFound = res => fail(res, 404, 'Chat not found');

// Chat ids are a UUID (local file) or an ObjectId (MongoDB): plain characters only
const ID = /^[A-Za-z0-9-]{1,64}$/;

router.use((req, res, next) => {
  if (!getHistoryStore()) return fail(res, 503, 'Chat history is temporarily unavailable');
  next();
});

// Counts one write for the signed-in user, or answers 429 and returns false
function allowWrite(req, res) {
  const limit = writesByUser.check(req.user.id);
  if (limit.limited) {
    const seconds = Math.max(1, limit.retryAfterSeconds);
    res.set('Retry-After', String(seconds));
    fail(res, 429, `Too many requests. Please try again in ${seconds} second${seconds === 1 ? '' : 's'}.`);
    return false;
  }
  writesByUser.hit(req.user.id);
  return true;
}

// @route   GET /api/v1/conversations
// @desc    The signed-in user's saved chats, most recently active first
router.get('/', wrap(async (req, res) => {
  const chats = await getHistoryStore().list(req.user.id);
  // retentionDays: chats are deleted this many days after their last message (0 = never)
  res.json({ success: true, data: chats, retentionDays: retentionDays() });
}));

// @route   POST /api/v1/conversations
// @desc    Start a saved chat
router.post('/', wrap(async (req, res) => {
  if (!allowWrite(req, res)) return;
  try {
    const chat = await getHistoryStore().create(req.user.id);
    res.status(201).json({ success: true, data: chat });
  } catch (err) {
    if (err instanceof TooManyChatsError) return fail(res, 409, err.message);
    throw err;
  }
}));

// @route   DELETE /api/v1/conversations
// @desc    Delete all of the signed-in user's saved chats
router.delete('/', wrap(async (req, res) => {
  const deleted = await getHistoryStore().removeAll(req.user.id);
  res.json({ success: true, message: 'All chats deleted', deleted });
}));

// @route   GET /api/v1/conversations/:id
// @desc    One saved chat with all its messages
router.get('/:id', wrap(async (req, res) => {
  if (!ID.test(req.params.id)) return notFound(res);
  const chat = await getHistoryStore().get(req.user.id, req.params.id);
  if (!chat) return notFound(res);
  res.json({ success: true, data: chat });
}));

// @route   POST /api/v1/conversations/:id/messages
// @desc    Add messages to a saved chat: { messages: [{ role: "user" | "bot", text }] }
router.post('/:id/messages', wrap(async (req, res) => {
  if (!ID.test(req.params.id)) return notFound(res);
  if (!allowWrite(req, res)) return;

  const entries = req.body?.messages;
  const problem = validateHistoryEntries(entries);
  if (problem) return fail(res, 400, problem);

  try {
    const chat = await getHistoryStore().append(req.user.id, req.params.id, entries);
    if (!chat) return notFound(res);
    res.json({ success: true, data: chat });
  } catch (err) {
    if (err instanceof ChatFullError) return fail(res, 409, err.message);
    throw err;
  }
}));

// @route   DELETE /api/v1/conversations/:id
// @desc    Delete one saved chat
router.delete('/:id', wrap(async (req, res) => {
  if (!ID.test(req.params.id)) return notFound(res);
  const removed = await getHistoryStore().remove(req.user.id, req.params.id);
  if (!removed) return notFound(res);
  res.json({ success: true, message: 'Chat deleted' });
}));

export default router;
