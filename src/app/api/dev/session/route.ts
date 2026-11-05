import { NextResponse } from "next/server";
import { bothUsers, clearSessionCookie, getUser, setSessionCookie } from "@/lib/auth";
import { sessionToolsEnabled } from "@/lib/devtools";
import { PAIR_ORDER } from "@/lib/config";

export const dynamic = "force-dynamic";

function forbidden() {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

/** Testing both sides of the pair from one phone: become the other person, or sign out. */
export async function POST(req: Request) {
  if (!sessionToolsEnabled()) return forbidden();

  const { action } = (await req.json().catch(() => ({}))) as { action?: string };

  if (action === "clear") {
    await clearSessionCookie();
    return NextResponse.json({ signedIn: false });
  }

  if (action === "switch") {
    const me = await getUser();
    if (!me) return NextResponse.json({ error: "not signed in" }, { status: 401 });
    const users = await bothUsers();
    const partner = PAIR_ORDER.map((s) => users[s]).find((u) => u.id !== me.id)!;
    await setSessionCookie(partner.id);
    return NextResponse.json({ signedIn: true, slug: partner.slug, displayName: partner.displayName });
  }

  return NextResponse.json({ error: "unknown action" }, { status: 400 });
}
