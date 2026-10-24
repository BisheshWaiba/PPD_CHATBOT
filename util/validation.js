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
