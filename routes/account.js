import express from 'express';
import { protect } from '../middleware/auth.js';
import { getUserStore } from '../util/userStore.js';
import { getHistoryStore } from '../util/historyStore.js';
import { RateLimiter } from '../util/rateLimit.js';

const router = express.Router();

// Everything here is about the signed-in account and nothing else
router.use(protect);

// Deleting an account cannot be undone, so it asks for the password again. A stolen sign-in
// (a token) alone is therefore not enough, and the password cannot be guessed through this door:
// after a few wrong tries the account has to wait.
const wrongPasswords = new RateLimiter({ max: 5, windowMs: 15 * 60 * 1000 });

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const wrap = handler => (req, res, next) => handler(req, res, next).catch(next);

// @route   GET /api/v1/account/export
// @desc    Everything stored about the signed-in user, as one downloadable JSON file. The answer is
//          the file itself, not wrapped in { success, data }.
router.get('/export', wrap(async (req, res) => {
  const history = getHistoryStore();
  if (!history) return fail(res, 503, 'Your data is temporarily unavailable');

  const chats = [];
  for (const summary of await history.list(req.user.id)) {
    const chat = await history.get(req.user.id, summary.id);
    if (chat) chats.push(chat);
  }

  const { id, name, email, role, createdAt } = req.user;
  res.set('Content-Disposition', 'attachment; filename="sutkeri-my-data.json"');
  res.json({
    exportedAt: new Date().toISOString(),
    about: 'Everything Sutkeri stores about this account. Passwords are never stored in readable form, so there is no password here.',
    account: { id, name, email, role, createdAt },
    chats
  });
}));

// @route   DELETE /api/v1/account
// @desc    Delete the account and everything saved with it. Body: { password }
router.delete('/', wrap(async (req, res) => {
  const store = getUserStore();
  const history = getHistoryStore();
  if (!store || !history) return fail(res, 503, 'Account deletion is temporarily unavailable. Please try again later.');

  const { password } = req.body || {};
  if (typeof password !== 'string' || !password) return fail(res, 400, 'Please enter your password to confirm');

  const limit = wrongPasswords.check(req.user.id);
  if (limit.limited) {
    const minutes = Math.max(1, Math.ceil(limit.retryAfterSeconds / 60));
    res.set('Retry-After', String(limit.retryAfterSeconds));
    return fail(res, 429, `Too many wrong passwords. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
  }

  // A wrong password is a 403, not a 401: a 401 means "your session is over" to the page, which
  // would sign the person out for a typo.
  const verified = await store.authenticate(req.user.email, password);
  if (!verified || verified.id !== req.user.id) {
    wrongPasswords.hit(req.user.id);
    return fail(res, 403, 'That password is not correct');
  }
  wrongPasswords.reset(req.user.id);

  // The saved chats first, the account last: if anything stops halfway the person can simply
  // try again, and nothing is left behind without an owner
  await history.removeAll(req.user.id);
  await store.deleteUser(req.user.id);

  // Every sign-in of this account (this token included) stops working at once, because the
  // account it belongs to no longer exists
  res.json({ success: true, message: 'Your account and everything saved with it have been deleted' });
}));

export default router;
