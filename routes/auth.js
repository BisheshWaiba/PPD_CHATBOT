import express from 'express';
import { protect } from '../middleware/auth.js';
import { signToken } from '../util/jwt.js';
import { getUserStore, DuplicateEmailError } from '../util/userStore.js';
import { validateRegistration, validateEmail, normalizeEmail } from '../util/validation.js';
import { RateLimiter } from '../util/rateLimit.js';

const router = express.Router();

// Brute-force protection. Failed sign-ins are counted per IP + email and per IP;
// every registration attempt is counted per IP.
const loginByAccount = new RateLimiter({ max: 8, windowMs: 15 * 60 * 1000 });
const loginByIp = new RateLimiter({ max: 40, windowMs: 15 * 60 * 1000 });
const registerByIp = new RateLimiter({ max: 10, windowMs: 60 * 60 * 1000 });

const fail = (res, status, message) => res.status(status).json({ success: false, message });

function tooMany(res, retryAfterSeconds) {
  res.set('Retry-After', String(retryAfterSeconds));
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return fail(res, 429, `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
}

// Forward errors from async handlers to the error middleware
const wrap = handler => (req, res, next) => handler(req, res, next).catch(next);

// @route   POST /api/auth/register
// @desc    Register user
// @access  Public
router.post('/register', wrap(async (req, res) => {
  const store = getUserStore();
  if (!store) return fail(res, 503, 'Registration is temporarily unavailable. Please try again later.');

  const limit = registerByIp.check(req.ip);
  if (limit.limited) return tooMany(res, limit.retryAfterSeconds);

  const { name, email, password } = req.body || {};
  const problem = validateRegistration({ name, email, password });
  if (problem) return fail(res, 400, problem);

  // Only attempts that pass validation count: they are the ones that cost hashing work
  registerByIp.hit(req.ip);

  let user;
  try {
    user = await store.create({ name: name.trim(), email: normalizeEmail(email), password });
  } catch (err) {
    if (err instanceof DuplicateEmailError) return fail(res, 409, err.message);
    throw err;
  }

  res.status(201).json({
    success: true,
    message: 'Account created successfully! Redirecting to sign in…',
    token: signToken(user),
    user
  });
}));

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', wrap(async (req, res) => {
  const store = getUserStore();
  if (!store) return fail(res, 503, 'Sign in is temporarily unavailable. Please try again later.');

  const { email, password } = req.body || {};
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return fail(res, 400, 'Please provide an email and password');
  }
  if (validateEmail(email)) return fail(res, 400, 'Please provide a valid email address');

  const normalized = normalizeEmail(email);
  const accountKey = `${req.ip}|${normalized}`;
  for (const [limiter, key] of [[loginByAccount, accountKey], [loginByIp, req.ip]]) {
    const limit = limiter.check(key);
    if (limit.limited) return tooMany(res, limit.retryAfterSeconds);
  }

  const user = await store.authenticate(normalized, password);
  if (!user) {
    loginByAccount.hit(accountKey);
    loginByIp.hit(req.ip);
    // Same message for an unknown email and a wrong password
    return fail(res, 401, 'Invalid email or password');
  }

  loginByAccount.reset(accountKey);
  res.status(200).json({ success: true, token: signToken(user), user });
}));

// @route   POST /api/auth/logout
// @desc    Sign out: this token stops working at once. The account's other sign-ins are kept.
// @access  Private
router.post('/logout', protect, wrap(async (req, res) => {
  const { jti, exp } = req.token;
  // Tokens from before sign-out existed have no id. They cannot be ended, only left to expire.
  if (jti) await getUserStore().revokeToken(jti, exp);
  res.status(200).json({ success: true, message: 'Signed out' });
}));

// @route   GET /api/auth/me
// @desc    Get current logged in user
// @access  Private
router.get('/me', protect, (req, res) => {
  res.status(200).json({ success: true, data: req.user });
});

export default router;
