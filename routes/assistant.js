import express from 'express';
import { protect } from '../middleware/auth.js';
import { assistantEnabled, assistantReply, safetyReply, AssistantUnavailableError } from '../util/assistant.js';
import { validateAssistantEntries } from '../util/validation.js';
import { RateLimiter } from '../util/rateLimit.js';

const router = express.Router();

// The AI conversation is for signed-in users only
router.use(protect);

// Every reply costs money, so each account has an allowance. Tests lower these with
// ASSISTANT_RATE_LIMIT (per minute) and ASSISTANT_DAILY_LIMIT. Only requests that reach the
// model count: a crisis message is always answered, and never held back by a limit.
const perMinute = new RateLimiter({ max: Number(process.env.ASSISTANT_RATE_LIMIT) || 12, windowMs: 60 * 1000 });
const perDay = new RateLimiter({ max: Number(process.env.ASSISTANT_DAILY_LIMIT) || 150, windowMs: 24 * 60 * 60 * 1000 });

const fail = (res, status, message) => res.status(status).json({ success: false, message });
const wrap = handler => (req, res, next) => handler(req, res, next).catch(next);

// @route   GET /api/v1/assistant
// @desc    Whether the AI conversation is switched on (an API key is set)
router.get('/', (req, res) => {
  res.json({ success: true, data: { enabled: assistantEnabled() } });
});

// @route   POST /api/v1/assistant/reply
// @desc    The assistant's next message: { messages: [{ role: "user" | "bot", text }] }, ending
//          with the person's message
router.post('/reply', wrap(async (req, res) => {
  const entries = req.body?.messages;
  const problem = validateAssistantEntries(entries);
  if (problem) return fail(res, 400, problem);

  // Safety comes first, in code, and does not depend on the model or on any limit
  const safe = safetyReply(entries);
  if (safe) return res.json({ success: true, data: { reply: safe, source: 'safety' } });

  if (!assistantEnabled()) return fail(res, 503, 'The assistant is not available right now.');

  for (const limiter of [perMinute, perDay]) {
    const limit = limiter.check(req.user.id);
    if (limit.limited) {
      const seconds = Math.max(1, limit.retryAfterSeconds);
      res.set('Retry-After', String(seconds));
      return fail(res, 429, 'You are sending messages too quickly. Please wait a little and try again.');
    }
  }
  perMinute.hit(req.user.id);
  perDay.hit(req.user.id);

  try {
    const { reply, source } = await assistantReply(entries);
    res.json({ success: true, data: { reply, source } });
  } catch (error) {
    if (!(error instanceof AssistantUnavailableError)) throw error;
    // The reason is for the server log. It never contains what the person wrote.
    console.error(`[assistant] no AI reply: ${error.reason}`);
    fail(res, 503, 'The assistant could not answer right now. Please try again in a moment.');
  }
}));

export default router;
