import { after, NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { isStoredPhotoUrl } from "@/lib/health/photos";
import { createDraft, createNamedDraft, getLibrary, readDraft } from "@/lib/health/foods";
import { addPendingLog } from "@/lib/health/entries";
import { requestZone } from "@/lib/health/requestZone";

export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(() => getLibrary());
}

/**
 * One packet in, one draft out: `{ images }` for photos already in the store,
 * or `{ name }` for a food asked for in words. Either way the reading is
 * handed to `after()`, so nobody waits on a model.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { images?: unknown; name?: unknown; grams?: unknown };

  // By name, optionally with an amount to log once the draft is confirmed:
  // "apple, 180 grams" the first time (§5.2).
  if (typeof body.name === "string") {
    const name = body.name;
    const grams = body.grams === undefined || body.grams === null ? null : Number(body.grams);
    const tz = await requestZone();
    return withUser(async (user) => {
      if (grams !== null && !(grams > 0)) throw new Error("That amount doesn't look right.");
      const id = await createNamedDraft(user, name);
      if (body.grams !== undefined) await addPendingLog(user.id, user.id, id, { grams, tz, source: "touch", inputText: name });
      after(() => readDraft(id));
      return { id };
    });
  }

  const urls = Array.isArray(body.images) ? body.images : [];
  if (!urls.length || urls.length > 2 || !urls.every((u) => typeof u === "string" && isStoredPhotoUrl(u))) {
    return NextResponse.json({ error: "one or two stored food photos, or a name, are required" }, { status: 400 });
  }
  return withUser(async (user) => {
    const id = await createDraft(user, urls as string[]);
    after(() => readDraft(id));
    return { id };
  });
}
