/** Token-bucket rate limiter. Clock is injected for deterministic tests. */
export class TokenBucket {
  private tokens: number;
  private lastRefill: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number,
  ) {
    this.tokens = capacity;
    this.lastRefill = now();
  }

  tryTake(): boolean {
    const t = this.now();
    const elapsed = (t - this.lastRefill) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * this.refillPerSecond);
    this.lastRefill = t;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
