import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Wakes the function and opens a Postgres connection. The PIN pad calls this on
 * mount, so by the time the fourth digit lands the sign-in request meets a warm
 * function and a Neon compute that isn't scaling up from zero.
 */
export async function GET() {
  try {
    await sql`select 1`;
  } catch {
    // Warming is best-effort; a failure here must never block the pad.
  }
  return new NextResponse(null, { status: 204 });
}
