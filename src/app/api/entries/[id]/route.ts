import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { deleteEntry, getHealthDay, updateEntry } from "@/lib/health/entries";
import { requestZone } from "@/lib/health/requestZone";
import { dateIn } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function entryId(ctx: Ctx) {
  const { id } = await ctx.params;
  return /^\d+$/.test(id) ? Number(id) : null;
}

/** Change the grams, or move the entry to another day. */
export async function PATCH(req: Request, ctx: Ctx) {
  const id = await entryId(ctx);
  if (id === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { grams?: unknown; localDate?: unknown };
  const tz = await requestZone();
  return withUser(async (user) => {
    await updateEntry(user, id, body);
    return getHealthDay(user, dateIn(tz));
  });
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = await entryId(ctx);
  if (id === null) return NextResponse.json({ error: "not found" }, { status: 404 });
  const tz = await requestZone();
  return withUser(async (user) => {
    await deleteEntry(user, id);
    return getHealthDay(user, dateIn(tz));
  });
}
