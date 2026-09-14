import { beforeEach, describe, expect, it } from "vitest";
import { consumeRate } from "../lib/http/session";

/**
 * These endpoints spend a paid Qwen quota and launch real browsers, so the
 * limiter is the thing standing between a public URL and a lost demo.
 */

const store = globalThis as unknown as { __complypilotRates?: Map<string, unknown> };

describe("rate limiter", () => {
  beforeEach(() => store.__complypilotRates?.clear());

  it("allows exactly the configured number of requests", () => {
    const results = Array.from({ length: 5 }, () => consumeRate("k", 3, 60_000));
    expect(results.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
  });

  it("counts each key separately, so one session cannot exhaust another", () => {
    consumeRate("a", 1, 60_000);
    expect(consumeRate("a", 1, 60_000).allowed).toBe(false);
    expect(consumeRate("b", 1, 60_000).allowed).toBe(true);
  });

  it("reports how many requests remain", () => {
    expect(consumeRate("k", 3, 60_000).remaining).toBe(2);
    expect(consumeRate("k", 3, 60_000).remaining).toBe(1);
    expect(consumeRate("k", 3, 60_000).remaining).toBe(0);
  });

  it("tells a blocked caller when to retry", () => {
    consumeRate("k", 1, 60_000);
    const blocked = consumeRate("k", 1, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("opens a fresh window once the old one has passed", () => {
    consumeRate("k", 1, 1);
    const later = Date.now() + 50;
    const original = Date.now;
    Date.now = () => later;
    try {
      expect(consumeRate("k", 1, 1).allowed).toBe(true);
    } finally {
      Date.now = original;
    }
  });
});
