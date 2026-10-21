// Central, typed configuration. Every tunable lives here and is sourced
// from environment variables so nothing is hardcoded across the codebase.

function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const config = {
  tcpTimeoutMs: intFromEnv("TCP_TIMEOUT_MS", 5000),
  udpTimeoutMs: intFromEnv("UDP_TIMEOUT_MS", 5000),
  rateLimitWindowMs: intFromEnv("RATE_LIMIT_WINDOW_MS", 60_000),
  rateLimitMaxRequests: intFromEnv("RATE_LIMIT_MAX_REQUESTS", 20),
  allowHostnames: (process.env.ALLOW_HOSTNAMES ?? "true").toLowerCase() !== "false",
  agentIdentifier: "port-test-agent",
  agentVersion: "1.0.0",
} as const;

// Hard ceilings that user-supplied config can never exceed, so a bad
// .env value can't turn a request into a long-running connection.
export const HARD_MAX_TIMEOUT_MS = 15_000;

export function clampTimeout(ms: number): number {
  return Math.min(Math.max(ms, 500), HARD_MAX_TIMEOUT_MS);
}
