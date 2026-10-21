export type Protocol = "tcp" | "udp";

export type TcpStatus = "open" | "refused" | "timeout" | "unreachable" | "invalid_target";

export type UdpStatus = "responding" | "no_response" | "network_error" | "invalid_target";

export type ErrorCode =
  | "INVALID_TARGET"
  | "INVALID_PORT"
  | "INVALID_PROTOCOL"
  | "REFUSED"
  | "TIMEOUT"
  | "UNREACHABLE"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface TestRequestBody {
  host: string;
  port: number;
}

export interface ResolvedTarget {
  /** The literal host/IP the client supplied. */
  inputHost: string;
  /** The IP address actually connected to, after DNS resolution if any. */
  resolvedIp: string;
  isHostname: boolean;
}

export interface TcpTestResult {
  success: boolean;
  protocol: "tcp";
  host: string;
  resolvedIp?: string;
  port: number;
  status: TcpStatus;
  latency_ms: number | null;
  message: string;
  test_id: string;
}

export interface UdpTestResult {
  success: boolean;
  protocol: "udp";
  host: string;
  resolvedIp?: string;
  port: number;
  status: UdpStatus;
  latency_ms: number | null;
  message: string;
  test_id: string;
}

export interface ApiErrorResponse {
  success: false;
  error: ErrorCode;
  message: string;
}
