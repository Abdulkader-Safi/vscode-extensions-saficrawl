import * as assert from "node:assert/strict";
import { RateLimiter } from "../rateLimiter";

suite("RateLimiter", () => {
  test("enforces min interval across serialized acquires", async () => {
    const rl = new RateLimiter(0.05); // 50ms
    const started = Date.now();
    await rl.acquire();
    await rl.acquire();
    await rl.acquire();
    const elapsed = Date.now() - started;
    assert.ok(elapsed >= 100, `expected >=100ms, got ${elapsed}ms`);
  });

  test("updateRate changes spacing live", async () => {
    const rl = new RateLimiter(0.2);
    await rl.acquire();
    rl.updateRate(0);
    const started = Date.now();
    await rl.acquire();
    const elapsed = Date.now() - started;
    assert.ok(elapsed < 50, `expected near-zero wait, got ${elapsed}ms`);
  });
});
