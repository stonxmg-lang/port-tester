import { NextResponse } from "next/server";
import { config } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    service: "port-tester-api",
    tcp_timeout_ms: config.tcpTimeoutMs,
    udp_timeout_ms: config.udpTimeoutMs,
    time: new Date().toISOString(),
  });
}
