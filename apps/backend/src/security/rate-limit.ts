/**
 * Fixed-window rate limiter (in memory, per process). Good enough for a single server; with several servers
 * this moves to Redis so limits are shared.
 */
export class RateLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  constructor(
    readonly limit: number,
    readonly windowMs: number,
  ) {}

  /** Returns how long to wait (ms) if over the limit, or 0 if allowed. */
  check(key: string, now = Date.now()): number {
    const h = this.hits.get(key);
    if (!h || h.resetAt <= now) {
      this.hits.set(key, { count: 1, resetAt: now + this.windowMs });
      if (this.hits.size > 50_000) this.sweep(now);
      return 0;
    }
    h.count++;
    return h.count > this.limit ? h.resetAt - now : 0;
  }

  private sweep(now: number) {
    for (const [k, v] of this.hits) if (v.resetAt <= now) this.hits.delete(k);
  }
}
