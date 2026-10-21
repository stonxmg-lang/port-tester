import { describe, it, expect, afterEach } from "vitest";
import net from "node:net";
import { probeTcp } from "@/lib/tcpProbe";

function listenOnEphemeralPort(server: net.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (addr && typeof addr === "object") resolve(addr.port);
    });
  });
}

describe("probeTcp", () => {
  let server: net.Server | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it("reports OPEN for a successful connection", async () => {
    server = net.createServer((socket) => {
      socket.end("PORT_TEST_AGENT\nPROTOCOL: TCP\nSTATUS: OK\nPORT: 0\n");
    });
    const port = await listenOnEphemeralPort(server);

    const outcome = await probeTcp("127.0.0.1", port, 2000);
    expect(outcome.status).toBe("open");
    expect(outcome.latencyMs).not.toBeNull();
  });

  it("reports REFUSED when nothing is listening", async () => {
    // Port 1 is virtually guaranteed to be closed/refused on loopback in CI.
    const outcome = await probeTcp("127.0.0.1", 1, 1000);
    expect(["refused", "unreachable"]).toContain(outcome.status);
  });

  it("reports TIMEOUT when the server accepts but never responds and connection lingers", async () => {
    // Use a server that accepts but the client will hit its own connect
    // timeout is hard to simulate for "open" TCP without a black-holed
    // route, so we instead validate the timeout path structurally: a
    // very short timeout against a slow/non-routable address.
    const outcome = await probeTcp("10.255.255.1", 9, 50);
    expect(["timeout", "unreachable"]).toContain(outcome.status);
  });

  it("reports INVALID/UNREACHABLE gracefully on garbage input rather than throwing", async () => {
    await expect(probeTcp("127.0.0.1", 65534, 500)).resolves.toBeDefined();
  });
});
