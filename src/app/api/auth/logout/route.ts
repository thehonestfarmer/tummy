import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * The product's own sign-out. The dev strip has its own, but that one is gated
 * behind DEV_SESSION_TOOLS and so does not exist in production.
 */
export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ signedIn: false });
}
