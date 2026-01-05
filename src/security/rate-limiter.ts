export class RateLimiter {
  private timestamps: number[] = [];
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(maxRequestsPerMinute: number) {
    this.windowMs = 60 * 1000; // 1 minute
    this.maxRequests = maxRequestsPerMinute;
  }

  /**
   * Check if operation is allowed. Returns true if within rate limit.
   */
  checkLimit(): boolean {
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter((ts) => ts > windowStart);

    if (this.timestamps.length >= this.maxRequests) {
      return false;
    }

    this.timestamps.push(now);
    return true;
  }

  /**
   * Get remaining requests in current window.
   */
  getRemainingRequests(): number {
    const now = Date.now();
    const windowStart = now - this.windowMs;
    this.timestamps = this.timestamps.filter((ts) => ts > windowStart);
    return Math.max(0, this.maxRequests - this.timestamps.length);
  }

  /**
   * Get time until next request is allowed (in ms). Returns 0 if requests available.
   */
  getTimeUntilReset(): number {
    if (this.timestamps.length < this.maxRequests) {
      return 0;
    }

    const oldestTimestamp = Math.min(...this.timestamps);
    const resetTime = oldestTimestamp + this.windowMs;
    return Math.max(0, resetTime - Date.now());
  }

  /**
   * Reset the rate limiter.
   */
  reset(): void {
    this.timestamps = [];
  }
}
