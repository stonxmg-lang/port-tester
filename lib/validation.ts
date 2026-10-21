import dns from "node:dns";
import { promisify } from "node:util";
import { isIP } from "node:net";

const dnsLookup = promisify(dns.lookup);

export class ValidationError extends Error {
  code: "INVALID_TARGET" | "INVALID_PORT" | "INVALID_PROTOCOL";
  constructor(code: "INVALID_TARGET" | "INVALID_PORT" | "INVALID_PROTOCOL", message: string) {
    super(message);
    this.code = code;
  }
}

/** Validate a port is an integer within the legal TCP/UDP range. */
export function validatePort(rawPort: unknown): number {
  const port = typeof rawPort === "string" ? Number(rawPort) : rawPort;
  if (typeof port !== "number" || !Number.isInteger(port)) {
    throw new ValidationError("INVALID_PORT", "Port must be an integer.");
  }
  if (port < 1 || port > 65535) {
    throw new ValidationError("INVALID_PORT", "Port must be between 1 and 65535.");
  }
  return port;
}

export function validateProtocol(rawProtocol: unknown): "tcp" | "udp" {
  if (rawProtocol !== "tcp" && rawProtocol !== "udp") {
    throw new ValidationError("INVALID_PROTOCOL", "Protocol must be 'tcp' or 'udp'.");
  }
  return rawProtocol;
}

const HOSTNAME_RE =
  /^(?=.{1,253}$)(?!-)[A-Za-z0-9-]{1,63}(?<!-)(\.(?!-)[A-Za-z0-9-]{1,63}(?<!-))*$/;

export function looksLikeHostname(value: string): boolean {
  return HOSTNAME_RE.test(value) && !isIP(value);
}

/**
 * IPv4/IPv6 ranges that must never be reachable through the probe:
 * loopback, unspecified, private, link-local, CGNAT, and other
 * reserved/special-use blocks. This is the SSRF allowlist boundary.
 */
function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

interface Cidr4 {
  base: string;
  bits: number;
}

const BLOCKED_IPV4_CIDRS: Cidr4[] = [
  { base: "0.0.0.0", bits: 8 }, // "this" network
  { base: "10.0.0.0", bits: 8 }, // private
  { base: "100.64.0.0", bits: 10 }, // CGNAT (RFC 6598)
  { base: "127.0.0.0", bits: 8 }, // loopback
  { base: "169.254.0.0", bits: 16 }, // link-local
  { base: "172.16.0.0", bits: 12 }, // private
  { base: "192.0.0.0", bits: 24 }, // IETF protocol assignments
  { base: "192.0.2.0", bits: 24 }, // TEST-NET-1
  { base: "192.88.99.0", bits: 24 }, // 6to4 relay anycast
  { base: "192.168.0.0", bits: 16 }, // private
  { base: "198.18.0.0", bits: 15 }, // benchmarking
  { base: "198.51.100.0", bits: 24 }, // TEST-NET-2
  { base: "203.0.113.0", bits: 24 }, // TEST-NET-3
  { base: "224.0.0.0", bits: 4 }, // multicast
  { base: "240.0.0.0", bits: 4 }, // reserved
  { base: "255.255.255.255", bits: 32 }, // broadcast
];

function isIpv4InCidr(ip: string, cidr: Cidr4): boolean {
  const ipInt = ipv4ToInt(ip);
  const baseInt = ipv4ToInt(cidr.base);
  const mask = cidr.bits === 0 ? 0 : (~0 << (32 - cidr.bits)) >>> 0;
  return (ipInt & mask) === (baseInt & mask);
}

function isBlockedIpv4(ip: string): boolean {
  return BLOCKED_IPV4_CIDRS.some((cidr) => isIpv4InCidr(ip, cidr));
}

function isBlockedIpv6(ip: string): boolean {
  const normalized = ip.toLowerCase();
  if (normalized === "::1" || normalized === "::") return true; // loopback / unspecified
  if (normalized.startsWith("::ffff:")) {
    // IPv4-mapped IPv6 address — validate the embedded IPv4 address too.
    const embedded = normalized.replace("::ffff:", "");
    if (isIP(embedded) === 4) return isBlockedIpv4(embedded);
  }
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // fc00::/7 unique local
  if (normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
      normalized.startsWith("fea") || normalized.startsWith("feb")) return true; // fe80::/10 link-local
  if (normalized.startsWith("2001:db8")) return true; // documentation range
  if (normalized.startsWith("ff")) return true; // multicast
  return false;
}

/** Returns true if the given literal IP address must be blocked. */
export function isBlockedIp(ip: string): boolean {
  const version = isIP(ip);
  if (version === 4) return isBlockedIpv4(ip);
  if (version === 6) return isBlockedIpv6(ip);
  return true; // not a parseable IP at all — treat as unsafe
}

/**
 * Resolves the target host to a public, non-blocked IP address.
 * - If the input is already a literal IP, it is validated directly.
 * - If it's a hostname, DNS is resolved server-side and EVERY resolved
 *   address is checked, closing the DNS-rebinding gap where a hostname
 *   could resolve to a private address after validation.
 */
export async function resolveAndValidateTarget(
  host: string
): Promise<{ resolvedIp: string; isHostname: boolean }> {
  if (typeof host !== "string" || host.trim().length === 0 || host.length > 255) {
    throw new ValidationError("INVALID_TARGET", "Host must be a non-empty string.");
  }

  const trimmed = host.trim();
  const directIpVersion = isIP(trimmed);

  if (directIpVersion) {
    if (isBlockedIp(trimmed)) {
      throw new ValidationError(
        "INVALID_TARGET",
        "Private, loopback, and reserved network ranges are not allowed."
      );
    }
    return { resolvedIp: trimmed, isHostname: false };
  }

  if (!looksLikeHostname(trimmed)) {
    throw new ValidationError("INVALID_TARGET", "Host is not a valid IP address or hostname.");
  }

  let addresses: dns.LookupAddress[];
  try {
    addresses = await dnsLookup(trimmed, { all: true, verbatim: true });
  } catch {
    throw new ValidationError("INVALID_TARGET", "Hostname could not be resolved.");
  }

  if (!addresses || addresses.length === 0) {
    throw new ValidationError("INVALID_TARGET", "Hostname did not resolve to any address.");
  }

  // Reject the whole request if ANY resolved address is private/reserved,
  // rather than picking a "safe looking" one — this is the DNS-rebinding
  // defense the spec calls for.
  for (const addr of addresses) {
    if (isBlockedIp(addr.address)) {
      throw new ValidationError(
        "INVALID_TARGET",
        "Hostname resolves to a private or reserved address, which is not allowed."
      );
    }
  }

  return { resolvedIp: addresses[0].address, isHostname: true };
}
