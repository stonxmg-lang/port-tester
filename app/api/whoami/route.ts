import { NextRequest, NextResponse } from "next/server";
import { clientKeyFromHeaders } from "@/lib/rateLimit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Informational only: reflects the public IP this request appeared to
// come from, so the user can compare it against their router's reported
// WAN IPv4 to spot CGNAT. This is not part of the port probe itself.
export async function GET(req: NextRequest) {
  const ip = clientKeyFromHeaders(req.headers);
  return NextResponse.json({ detected_public_ip: ip === "unknown" ? null : ip });
}
