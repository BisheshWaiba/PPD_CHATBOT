// Small in-memory limiter for sign-in and registration attempts.
// One instance per process, so run a shared store (e.g. Redis) if you ever scale to several servers.
export class RateLimiter {
  constructor({ max, windowMs }) {
    this.max = max;
    this.windowMs = windowMs;
    this.entries = new Map();
  }

  #live(key, now) {
    const entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.entries.delete(key);
      return null;
    }
    return entry;
  }

  #sweep(now) {
    if (this.entries.size < 500) return;
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) this.entries.delete(key);
    }
  }

  // Is this key already over the limit? Does not count as an attempt.
  check(key) {
    const now = Date.now();
    const entry = this.#live(key, now);
    if (entry && entry.count >= this.max) {
      return { limited: true, retryAfterSeconds: Math.ceil((entry.resetAt - now) / 1000) };
    }
    return { limited: false, retryAfterSeconds: 0 };
  }

  // Count one attempt
  hit(key) {
    const now = Date.now();
    this.#sweep(now);
    const entry = this.#live(key, now) || { count: 0, resetAt: now + this.windowMs };
    entry.count += 1;
    this.entries.set(key, entry);
  }

  reset(key) {
    this.entries.delete(key);
  }
}
