import dgram from "node:dgram";
import { randomUUID } from "node:crypto";
import { clampTimeout, config } from "./config";
import type { UdpStatus } from "./types";

export interface UdpProbeOutcome {
  status: UdpStatus;
  latencyMs: number | null;
  message: string;
  testId: string;
}

/**
 * UDP has no connection state, so "open" vs "closed" cannot be inferred
 * from the transport alone. Instead we run a tiny application-level
 * request/response protocol against the listener agent: send a request
 * carrying a random test ID, and only accept a reply that echoes that
 * exact ID back. A silent timeout is reported as NO_RESPONSE, never as
 * "closed", because firewalls commonly drop UDP without signaling.
 */
export function probeUdp(ip: string, port: number, timeoutMsOverride?: number): Promise<UdpProbeOutcome> {
  const timeoutMs = clampTimeout(timeoutMsOverride ?? config.udpTimeoutMs);
  const testId = randomUUID();

  const payload = [
    "PORT_TEST_REQUEST",
    `id=${testId}`,
    `port=${port}`,
    `agent=${config.agentIdentifier}/${config.agentVersion}`,
  ].join("\n");

  return new Promise((resolve) => {
    const socket = dgram.createSocket(ip.includes(":") ? "udp6" : "udp4");
    const start = process.hrtime.bigint();
    let settled = false;

    const elapsedMs = () => Number((process.hrtime.bigint() - start) / BigInt(1_000_000));

    const finish = (outcome: UdpProbeOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.removeAllListeners();
      try {
        socket.close();
      } catch {
        /* already closed */
      }
      resolve(outcome);
    };

    const timer = setTimeout(() => {
      finish({
        status: "no_response",
        latencyMs: null,
        message:
          "No response received. This does not conclusively prove the port is closed — firewalls often drop UDP traffic silently.",
        testId,
      });
    }, timeoutMs);

    socket.once("error", (err: NodeJS.ErrnoException) => {
      finish({
        status: "network_error",
        latencyMs: null,
        message: `Network error: ${err.code ?? "unknown"}.`,
        testId,
      });
    });

    socket.on("message", (msg) => {
      const text = msg.toString("utf8");
      const idMatch = text.match(/^id=(.+)$/m);
      const receivedId = idMatch?.[1]?.trim();

      if (receivedId === testId) {
        finish({
          status: "responding",
          latencyMs: elapsedMs(),
          message: "Received a matching response from the target.",
          testId,
        });
      }
      // A message with a mismatched/stale ID is ignored; keep waiting
      // until the timeout in case the correct reply is still in flight.
    });

    const buffer = Buffer.from(payload, "utf8");
    socket.send(buffer, port, ip, (err) => {
      if (err) {
        finish({
          status: "network_error",
          latencyMs: null,
          message: `Failed to send UDP request: ${err.message}.`,
          testId,
        });
      }
    });
  });
}
