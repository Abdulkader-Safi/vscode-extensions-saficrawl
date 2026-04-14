export class RateLimiter {
  private minIntervalMs: number;
  private lastRequestAt = 0;
  private chain: Promise<void> = Promise.resolve();

  constructor(delaySec: number) {
    this.minIntervalMs = Math.max(0, delaySec * 1000);
  }

  updateRate(delaySec: number): void {
    this.minIntervalMs = Math.max(0, delaySec * 1000);
  }

  acquire(): Promise<void> {
    const next = this.chain.then(async () => {
      if (this.minIntervalMs === 0) {
        this.lastRequestAt = Date.now();
        return;
      }
      const elapsed = Date.now() - this.lastRequestAt;
      const wait = this.minIntervalMs - elapsed;
      if (wait > 0) {await delay(wait);}
      this.lastRequestAt = Date.now();
    });
    this.chain = next.catch(() => undefined);
    return next;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
