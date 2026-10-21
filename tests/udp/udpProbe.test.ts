import { describe, it, expect, afterEach } from "vitest";
import dgram from "node:dgram";
import { probeUdp } from "@/lib/udpProbe";

function listenOnEphemeralPort(socket: dgram.Socket): Promise<number> {
  return new Promise((resolve) => {
    socket.bind(0, "127.0.0.1", () => {
      resolve((socket.address() as dgram.AddressInfo).port);
    });
  });
}

describe("probeUdp", () => {
  let server: dgram.Socket | null = null;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => server!.close(() => resolve()));
      server = null;
    }
  });

  it("reports RESPONDING when the echo server replies with a matching ID", async () => {
    server = dgram.createSocket("udp4");
    server.on("message", (msg, rinfo) => {
      const text = msg.toString("utf8");
      const idMatch = text.match(/^id=(.+)$/m);
      if (!idMatch) return;
      const reply = `PORT_TEST_RESPONSE\nid=${idMatch[1]}\nport=0\nstatus=ok\n`;
      server!.send(reply, rinfo.port, rinfo.address);
    });
    const port = await listenOnEphemeralPort(server);

    const outcome = await probeUdp("127.0.0.1", port, 2000);
    expect(outcome.status).toBe("responding");
    expect(outcome.latencyMs).not.toBeNull();
  });

  it("ignores a response with a mismatched test ID and eventually times out", async () => {
    server = dgram.createSocket("udp4");
    server.on("message", (_msg, rinfo) => {
      const reply = "PORT_TEST_RESPONSE\nid=stale-id-not-matching\nport=0\nstatus=ok\n";
      server!.send(reply, rinfo.port, rinfo.address);
    });
    const port = await listenOnEphemeralPort(server);

    const outcome = await probeUdp("127.0.0.1", port, 600);
    expect(outcome.status).toBe("no_response");
  }, 10_000);

  it("reports NO_RESPONSE when nothing answers", async () => {
    // Bind and immediately close so the port is very likely free but the
    // absence of an ICMP unreachable simulates a firewall silently
    // dropping the packet in most environments.
    const probe = dgram.createSocket("udp4");
    const freePort = await listenOnEphemeralPort(probe);
    await new Promise<void>((resolve) => probe.close(() => resolve()));

    const outcome = await probeUdp("127.0.0.1", freePort, 500);
    expect(["no_response", "network_error"]).toContain(outcome.status);
  });
});
