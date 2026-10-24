// Shared rules for sign-up, sign-in and chat messages. The browser forms apply the same limits.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const PASSWORD_MIN = 8;
// bcrypt only uses the first 72 bytes, so longer passwords would be silently truncated
export const PASSWORD_MAX_BYTES = 72;
export const NAME_MAX = 50;
export const EMAIL_MAX = 254;
// Long enough to describe how someone feels in detail. Every message starts a Python process,
// so it must not be unlimited.
export const CHAT_MESSAGE_MAX = 1000;

export const normalizeEmail = value => String(value).trim().toLowerCase();

export function validateEmail(value) {
  if (typeof value !== 'string' || !value.trim()) return 'Please provide an email address';
  const email = value.trim();
  if (email.length > EMAIL_MAX || !EMAIL_RE.test(email)) return 'Please provide a valid email address';
  return null;
}

// Saved chat history. A saved message may be longer than one a person types, because it can be
// one of the assistant's answers.
export const HISTORY_TEXT_MAX = 4000;
export const HISTORY_BATCH_MAX = 20;

export function validateHistoryEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return 'Please send the messages to save';
  if (entries.length > HISTORY_BATCH_MAX) return `Send at most ${HISTORY_BATCH_MAX} messages at a time`;
  for (const entry of entries) {
    if (!entry || (entry.role !== 'user' && entry.role !== 'bot')) return 'Each message needs a role of "user" or "bot"';
    if (typeof entry.text !== 'string' || !entry.text.trim()) return 'Each message needs some text';
    if (entry.text.length > HISTORY_TEXT_MAX) return `A message cannot be more than ${HISTORY_TEXT_MAX} characters`;
  }
  return null;
}

// The conversation sent to the AI model: the last messages of the chat, ending with the person's
// own message.
export const ASSISTANT_ENTRIES_MAX = 20;
export const ASSISTANT_ENTRY_MAX = 3000; // one message (an assistant reply can be long)
export const ASSISTANT_LAST_MAX = 1000;  // the person's newest message

export function validateAssistantEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) return 'Please send the conversation so far';
  if (entries.length > ASSISTANT_ENTRIES_MAX) return `Send at most ${ASSISTANT_ENTRIES_MAX} messages`;
  for (const entry of entries) {
    if (!entry || (entry.role !== 'user' && entry.role !== 'bot')) return 'Each message needs a role of "user" or "bot"';
    if (typeof entry.text !== 'string' || !entry.text.trim()) return 'Each message needs some text';
    if (entry.text.length > ASSISTANT_ENTRY_MAX) return `A message cannot be more than ${ASSISTANT_ENTRY_MAX} characters`;
  }
  const last = entries[entries.length - 1];
  if (last.role !== 'user') return 'The conversation must end with your message';
  if (last.text.length > ASSISTANT_LAST_MAX) return `Your message cannot be more than ${ASSISTANT_LAST_MAX} characters`;
  return null;
}

export function validateChatMessage(message) {
  if (typeof message !== 'string' || !message.trim()) return 'Please write a message';
  if (message.length > CHAT_MESSAGE_MAX) return `Message cannot be more than ${CHAT_MESSAGE_MAX} characters`;
  return null;
}

export function validateRegistration({ name, email, password } = {}) {
  if (typeof name !== 'string' || !name.trim()) return 'Please provide your name';
  if (name.trim().length > NAME_MAX) return `Name cannot be more than ${NAME_MAX} characters`;

  const emailError = validateEmail(email);
  if (emailError) return emailError;

  if (typeof password !== 'string' || !password) return 'Please provide a password';
  if (password.length < PASSWORD_MIN) return `Password must be at least ${PASSWORD_MIN} characters long`;
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_BYTES) return `Password is too long (maximum ${PASSWORD_MAX_BYTES} bytes)`;
  if (password.trim().toLowerCase() === email.trim().toLowerCase()) return 'Password cannot be the same as your email';
  return null;
}
