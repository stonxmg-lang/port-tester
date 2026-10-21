import net from "node:net";
import { clampTimeout, config } from "./config";
import type { TcpStatus } from "./types";

export interface TcpProbeOutcome {
  status: TcpStatus;
  latencyMs: number | null;
  message: string;
  agentResponse?: string;
}

/**
 * Performs a single outbound TCP connection attempt to ip:port.
 * This is a client-side connect() call only — it never binds or
 * listens on a socket, so it stays compatible with serverless
 * execution and does not turn the API into a persistent server.
 */
export function probeTcp(ip: string, port: number, timeoutMsOverride?: number): Promise<TcpProbeOutcome> {
  const timeoutMs = clampTimeout(timeoutMsOverride ?? config.tcpTimeoutMs);

  return new Promise((resolve) => {
    const socket = new net.Socket();
    const start = process.hrtime.bigint();
    let settled = false;
    let responseBuffer = "";

    const finish = (outcome: TcpProbeOutcome) => {
      if (settled) return;
      settled = true;
      socket.removeAllListeners();
      socket.destroy();
      resolve(outcome);
    };

    const elapsedMs = () => Number((process.hrtime.bigint() - start) / BigInt(1_000_000));

    socket.setTimeout(timeoutMs);

    socket.once("connect", () => {
      const latencyMs = elapsedMs();
      // Give the remote agent a brief window to send its deterministic
      // banner, but the connection itself already proves the port is open
      // regardless of whether a banner arrives.
      const grace = setTimeout(() => {
        finish({
          status: "open",
          latencyMs,
          message: "TCP connection established.",
          agentResponse: responseBuffer || undefined,
        });
      }, Math.min(1500, timeoutMs));

      socket.on("data", (chunk) => {
        responseBuffer += chunk.toString("utf8");
      });

      socket.once("close", () => {
        clearTimeout(grace);
        finish({
          status: "open",
          latencyMs,
          message: "TCP connection established.",
          agentResponse: responseBuffer || undefined,
        });
      });
    });

    socket.once("timeout", () => {
      finish({
        status: "timeout",
        latencyMs: null,
        message: `No response within ${timeoutMs}ms.`,
      });
    });

    socket.once("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ECONNREFUSED") {
        finish({
          status: "refused",
          latencyMs: elapsedMs(),
          message: "Connection actively refused by the remote host.",
        });
        return;
      }
      if (err.code === "ETIMEDOUT" || err.code === "EHOSTUNREACH" || err.code === "ENETUNREACH") {
        finish({
          status: "unreachable",
          latencyMs: null,
          message: "The target network is unreachable.",
        });
        return;
      }
      finish({
        status: "unreachable",
        latencyMs: null,
        message: `Network error: ${err.code ?? "unknown"}.`,
      });
    });

    try {
      socket.connect({ host: ip, port });
    } catch {
      finish({
        status: "unreachable",
        latencyMs: null,
        message: "Failed to initiate connection.",
      });
    }
  });
}
