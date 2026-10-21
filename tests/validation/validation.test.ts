import { describe, it, expect } from "vitest";
import {
  validatePort,
  validateProtocol,
  isBlockedIp,
  resolveAndValidateTarget,
  ValidationError,
} from "@/lib/validation";

describe("validatePort", () => {
  it("accepts a valid port", () => {
    expect(validatePort(4444)).toBe(4444);
  });

  it("accepts a valid port as string", () => {
    expect(validatePort("4444")).toBe(4444);
  });

  it("accepts the minimum valid port", () => {
    expect(validatePort(1)).toBe(1);
  });

  it("accepts the maximum valid port", () => {
    expect(validatePort(65535)).toBe(65535);
  });

  it("rejects port 0", () => {
    expect(() => validatePort(0)).toThrow(ValidationError);
  });

  it("rejects a port above 65535", () => {
    expect(() => validatePort(65536)).toThrow(ValidationError);
  });

  it("rejects a non-integer port", () => {
    expect(() => validatePort(80.5)).toThrow(ValidationError);
  });

  it("rejects a non-numeric port", () => {
    expect(() => validatePort("abc")).toThrow(ValidationError);
  });
});

describe("validateProtocol", () => {
  it("accepts tcp", () => {
    expect(validateProtocol("tcp")).toBe("tcp");
  });

  it("accepts udp", () => {
    expect(validateProtocol("udp")).toBe("udp");
  });

  it("rejects anything else", () => {
    expect(() => validateProtocol("icmp")).toThrow(ValidationError);
  });
});

describe("isBlockedIp", () => {
  it("blocks loopback", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
  });

  it("blocks 10.x private range", () => {
    expect(isBlockedIp("10.1.2.3")).toBe(true);
  });

  it("blocks 192.168.x private range", () => {
    expect(isBlockedIp("192.168.1.1")).toBe(true);
  });

  it("blocks 172.16-31.x private range", () => {
    expect(isBlockedIp("172.16.5.5")).toBe(true);
    expect(isBlockedIp("172.31.255.255")).toBe(true);
    expect(isBlockedIp("172.32.0.1")).toBe(false);
  });

  it("blocks link-local", () => {
    expect(isBlockedIp("169.254.1.1")).toBe(true);
  });

  it("blocks CGNAT range", () => {
    expect(isBlockedIp("100.64.0.1")).toBe(true);
  });

  it("blocks IPv6 loopback", () => {
    expect(isBlockedIp("::1")).toBe(true);
  });

  it("blocks IPv6 unique-local", () => {
    expect(isBlockedIp("fd00::1")).toBe(true);
  });

  it("blocks IPv6 link-local", () => {
    expect(isBlockedIp("fe80::1")).toBe(true);
  });

  it("allows a public IPv4 address", () => {
    expect(isBlockedIp("8.8.8.8")).toBe(false);
  });

  it("allows a public IPv6 address", () => {
    expect(isBlockedIp("2001:4860:4860::8888")).toBe(false);
  });
});

describe("resolveAndValidateTarget", () => {
  it("accepts a valid public IP directly", async () => {
    const result = await resolveAndValidateTarget("8.8.8.8");
    expect(result.resolvedIp).toBe("8.8.8.8");
    expect(result.isHostname).toBe(false);
  });

  it("rejects a loopback IP", async () => {
    await expect(resolveAndValidateTarget("127.0.0.1")).rejects.toThrow(ValidationError);
  });

  it("rejects a private IP", async () => {
    await expect(resolveAndValidateTarget("192.168.1.1")).rejects.toThrow(ValidationError);
  });

  it("rejects an empty host", async () => {
    await expect(resolveAndValidateTarget("")).rejects.toThrow(ValidationError);
  });

  it("rejects a malformed hostname", async () => {
    await expect(resolveAndValidateTarget("-not-valid-.")).rejects.toThrow(ValidationError);
  });
});
