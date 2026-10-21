import { describe, it, expect } from "vitest";
import { hit } from "@/lib/rateLimit";

describe("rate limiter", () => {
  it("allows requests under the configured max", () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      const result = hit(key);
      expect(result.allowed).toBe(true);
    }
  });

  it("blocks requests once the max is exceeded", () => {
    const key = `test-burst-${Math.random()}`;
    const max = Number(process.env.RATE_LIMIT_MAX_REQUESTS ?? 20);
    let lastResult;
    for (let i = 0; i < max + 5; i++) {
      lastResult = hit(key);
    }
    expect(lastResult!.allowed).toBe(false);
  });

  it("tracks separate keys independently", () => {
    const a = hit(`independent-a-${Math.random()}`);
    const b = hit(`independent-b-${Math.random()}`);
    expect(a.allowed).toBe(true);
    expect(b.allowed).toBe(true);
  });
});
