import { NextResponse } from "next/server";
import { setSessionCookie, userByPin } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const { pin } = (await req.json().catch(() => ({}))) as { pin?: string };
  if (typeof pin !== "string" || !/^\d{4}$/.test(pin)) {
    return NextResponse.json({ error: "invalid" }, { status: 400 });
  }
  const user = await userByPin(pin);
  if (!user) return NextResponse.json({ error: "invalid" }, { status: 401 });
  await setSessionCookie(user.id);
  return NextResponse.json({ slug: user.slug, displayName: user.displayName });
}
