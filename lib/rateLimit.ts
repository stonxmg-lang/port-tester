import { config } from "./config";

// Simple in-memory sliding-window limiter. This resets whenever the
// serverless function's container is recycled, which is an accepted
// tradeoff for a lightweight, dependency-free deployment. For
// multi-instance production use, swap this for a shared store (e.g.
// Vercel KV / Upstash Redis) behind the same `hit()` interface.

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

// Periodically forget stale buckets so memory doesn't grow unbounded
// across the lifetime of a warm serverless instance.
const MAX_BUCKETS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetMs: number;
}

export function hit(key: string): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= config.rateLimitWindowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    if (buckets.size > MAX_BUCKETS) {
      const oldestKey = buckets.keys().next().value;
      if (oldestKey) buckets.delete(oldestKey);
    }
    return { allowed: true, remaining: config.rateLimitMaxRequests - 1, resetMs: config.rateLimitWindowMs };
  }

  existing.count += 1;
  const resetMs = config.rateLimitWindowMs - (now - existing.windowStart);

  if (existing.count > config.rateLimitMaxRequests) {
    return { allowed: false, remaining: 0, resetMs };
  }

  return { allowed: true, remaining: config.rateLimitMaxRequests - existing.count, resetMs };
}

/** Best-effort client identifier from standard proxy headers. */
export function clientKeyFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
