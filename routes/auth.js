import express from 'express';
import { protect } from '../middleware/auth.js';
import { signToken } from '../util/jwt.js';
import { getUserStore, DuplicateEmailError } from '../util/userStore.js';
import { validateRegistration, validateEmail, validatePassword, normalizeEmail } from '../util/validation.js';
import { RateLimiter } from '../util/rateLimit.js';
import { hashToken, looksLikeToken } from '../util/authTokens.js';
import { emailEnabled, inBackground, sendResetEmail, sendVerificationEmail, sendPasswordChangedEmail } from '../util/accountEmails.js';

const router = express.Router();

// Brute-force protection. Failed sign-ins are counted per IP + email and per IP;
// every registration attempt is counted per IP.
const loginByAccount = new RateLimiter({ max: 8, windowMs: 15 * 60 * 1000 });
const loginByIp = new RateLimiter({ max: 40, windowMs: 15 * 60 * 1000 });
const registerByIp = new RateLimiter({ max: 10, windowMs: 60 * 60 * 1000 });

// Email links. Every request to /forgot-password counts, whether or not the address belongs to an
// account, so the limits cannot be used to find out which addresses do. They also stop the form
// from being used to fill someone's inbox.
const forgotByIp = new RateLimiter({ max: 10, windowMs: 60 * 60 * 1000 });
const forgotByEmail = new RateLimiter({ max: 3, windowMs: 60 * 60 * 1000 });
const badLinksByIp = new RateLimiter({ max: 15, windowMs: 15 * 60 * 1000 });
const resendByUser = new RateLimiter({ max: 3, windowMs: 60 * 60 * 1000 });

const fail = (res, status, message) => res.status(status).json({ success: false, message });

function tooMany(res, retryAfterSeconds) {
  res.set('Retry-After', String(retryAfterSeconds));
  const minutes = Math.max(1, Math.ceil(retryAfterSeconds / 60));
  return fail(res, 429, `Too many attempts. Please try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`);
}

// Forward errors from async handlers to the error middleware
const wrap = handler => (req, res, next) => handler(req, res, next).catch(next);

const LINK_PROBLEM = 'This link is not valid any more. It may have expired or already been used.';

// @route   GET /api/auth/features
// @desc    What this server can do, so the pages can show or hide what depends on email
// @access  Public
router.get('/features', (req, res) => {
  res.status(200).json({ success: true, data: { email: emailEnabled() } });
});

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

  // Ask for the address to be confirmed. This never holds up, or fails, the sign-up.
  if (emailEnabled()) inBackground(sendVerificationEmail(user), 'verification');

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

// @route   POST /api/auth/forgot-password
// @desc    Email a link for choosing a new password. The answer is the same whether or not the
//          address has an account, so this cannot be used to find out who has one. Links only go
//          to addresses that were confirmed: a mistyped address at sign-up must never let a
//          stranger take the account over.
// @access  Public
router.post('/forgot-password', wrap(async (req, res) => {
  const store = getUserStore();
  if (!store) return fail(res, 503, 'This is temporarily unavailable. Please try again later.');
  if (!emailEnabled()) return fail(res, 503, 'Password reset by email is not available on this server.');

  const { email } = req.body || {};
  const problem = validateEmail(email);
  if (problem) return fail(res, 400, problem);

  const normalized = normalizeEmail(email);
  for (const [limiter, key] of [[forgotByIp, req.ip], [forgotByEmail, normalized]]) {
    const limit = limiter.check(key);
    if (limit.limited) return tooMany(res, limit.retryAfterSeconds);
  }
  forgotByIp.hit(req.ip);
  forgotByEmail.hit(normalized);

  const user = await store.findByEmail(normalized);
  if (user?.emailVerified) inBackground(sendResetEmail(user), 'password reset');

  res.status(200).json({
    success: true,
    message: 'If that address belongs to an account with a confirmed email, a link to choose a new password is on its way. It works for 1 hour.'
  });
}));

// @route   POST /api/auth/check-reset-link
// @desc    Is this reset link still good? Lets the page say so before anyone types a new password.
//          Does not use the link up. Bad guesses count towards the same limit as reset-password.
// @access  Public
router.post('/check-reset-link', wrap(async (req, res) => {
  const store = getUserStore();
  if (!store) return fail(res, 503, 'This is temporarily unavailable. Please try again later.');

  const limit = badLinksByIp.check(req.ip);
  if (limit.limited) return tooMany(res, limit.retryAfterSeconds);

  const { token } = req.body || {};
  const userId = looksLikeToken(token) ? await store.peekAuthToken('reset', hashToken(token)) : null;
  if (!userId || !(await store.findById(userId))) {
    badLinksByIp.hit(req.ip);
    return fail(res, 400, LINK_PROBLEM);
  }

  res.status(200).json({ success: true });
}));

// @route   POST /api/auth/reset-password
// @desc    Choose a new password with the link from the email. Every sign-in made before this
//          stops working.
// @access  Public
router.post('/reset-password', wrap(async (req, res) => {
  const store = getUserStore();
  if (!store) return fail(res, 503, 'This is temporarily unavailable. Please try again later.');

  const limit = badLinksByIp.check(req.ip);
  if (limit.limited) return tooMany(res, limit.retryAfterSeconds);

  const { token, password } = req.body || {};
  const hash = looksLikeToken(token) ? hashToken(token) : null;
  const userId = hash ? await store.peekAuthToken('reset', hash) : null;
  const user = userId ? await store.findById(userId) : null;
  if (!user) {
    badLinksByIp.hit(req.ip);
    return fail(res, 400, LINK_PROBLEM);
  }

  // A password that is too weak is sent back WITHOUT using up the link, so it can be tried again
  const problem = validatePassword(password, user.email);
  if (problem) return fail(res, 400, problem);

  // Using the link up is a single step, so two requests with the same link cannot both win
  if (await store.consumeAuthToken('reset', hash) !== userId) {
    badLinksByIp.hit(req.ip);
    return fail(res, 400, LINK_PROBLEM);
  }

  await store.setPassword(userId, password);
  inBackground(sendPasswordChangedEmail(user), 'password changed');

  res.status(200).json({ success: true, message: 'Your password has been changed. Please sign in with your new password.' });
}));

// @route   POST /api/auth/verify-email
// @desc    Confirm an email address with the link from the email. The link is the proof, so being
//          signed in is not needed (it is often opened on another device).
// @access  Public
router.post('/verify-email', wrap(async (req, res) => {
  const store = getUserStore();
  if (!store) return fail(res, 503, 'This is temporarily unavailable. Please try again later.');

  const limit = badLinksByIp.check(req.ip);
  if (limit.limited) return tooMany(res, limit.retryAfterSeconds);

  const { token } = req.body || {};
  const userId = looksLikeToken(token) ? await store.consumeAuthToken('verify', hashToken(token)) : null;
  if (!userId || !(await store.markEmailVerified(userId))) {
    badLinksByIp.hit(req.ip);
    return fail(res, 400, LINK_PROBLEM);
  }

  res.status(200).json({ success: true, message: 'Your email address is confirmed. Thank you!' });
}));

// @route   POST /api/auth/resend-verification
// @desc    Send the confirmation email again
// @access  Private
router.post('/resend-verification', protect, wrap(async (req, res) => {
  if (req.user.emailVerified) {
    return res.status(200).json({ success: true, message: 'Your email address is already confirmed.' });
  }
  if (!emailEnabled()) return fail(res, 503, 'Email is not available on this server, so a confirmation email cannot be sent.');

  const limit = resendByUser.check(req.user.id);
  if (limit.limited) return tooMany(res, limit.retryAfterSeconds);
  resendByUser.hit(req.user.id);

  inBackground(sendVerificationEmail(req.user), 'verification');
  res.status(200).json({ success: true, message: `We sent a confirmation link to ${req.user.email}. It works for 2 days.` });
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
