import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Opens a Postgres connection. The PIN pad calls this on mount, so by the
 * time the fourth digit lands the sign-in request has a connection waiting.
 * Also what the container's health check calls.
 */
export async function GET() {
  try {
    await sql`select 1`;
  } catch {
    // Warming is best-effort; a failure here must never block the pad.
  }
  return new NextResponse(null, { status: 204 });
}
