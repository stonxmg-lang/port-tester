import { NextRequest, NextResponse } from "next/server";
import { validatePort, resolveAndValidateTarget, ValidationError } from "@/lib/validation";
import { probeUdp } from "@/lib/udpProbe";
import { hit, clientKeyFromHeaders } from "@/lib/rateLimit";
import type { UdpTestResult, ApiErrorResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const clientKey = clientKeyFromHeaders(req.headers);
  const rl = hit(`udp:${clientKey}`);
  if (!rl.allowed) {
    const body: ApiErrorResponse = {
      success: false,
      error: "RATE_LIMITED",
      message: "Too many requests. Please wait before trying again.",
    };
    return NextResponse.json(body, {
      status: 429,
      headers: { "Retry-After": Math.ceil(rl.resetMs / 1000).toString() },
    });
  }

  let host: string;
  let port: number;

  try {
    const json = await req.json();
    host = typeof json.host === "string" ? json.host : "";
    port = validatePort(json.port);
  } catch (err) {
    if (err instanceof ValidationError) {
      const body: ApiErrorResponse = { success: false, error: err.code, message: err.message };
      return NextResponse.json(body, { status: 400 });
    }
    const body: ApiErrorResponse = { success: false, error: "INVALID_TARGET", message: "Malformed request body." };
    return NextResponse.json(body, { status: 400 });
  }

  let resolvedIp: string;
  let isHostname: boolean;
  try {
    const resolved = await resolveAndValidateTarget(host);
    resolvedIp = resolved.resolvedIp;
    isHostname = resolved.isHostname;
  } catch (err) {
    if (err instanceof ValidationError) {
      const body: ApiErrorResponse = { success: false, error: err.code, message: err.message };
      return NextResponse.json(body, { status: 400 });
    }
    const body: ApiErrorResponse = { success: false, error: "INTERNAL_ERROR", message: "Could not validate target." };
    return NextResponse.json(body, { status: 500 });
  }

  try {
    const outcome = await probeUdp(resolvedIp, port);
    const result: UdpTestResult = {
      success: outcome.status === "responding",
      protocol: "udp",
      host,
      ...(isHostname ? { resolvedIp } : {}),
      port,
      status: outcome.status,
      latency_ms: outcome.latencyMs,
      message: outcome.message,
      test_id: outcome.testId,
    };
    return NextResponse.json(result, { status: 200 });
  } catch {
    const body: ApiErrorResponse = {
      success: false,
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred while running the test.",
    };
    return NextResponse.json(body, { status: 500 });
  }
}
