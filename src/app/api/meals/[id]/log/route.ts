import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { getHealthDay } from "@/lib/health/entries";
import { logMeal } from "@/lib/health/meals";
import { requestZone } from "@/lib/health/requestZone";
import { dateIn, isDate } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/** One tap for every food in a saved meal, into today or the past day named by `date`. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { date } = (await req.json().catch(() => ({}))) as { date?: unknown };
  const localDate = isDate(date) ? date : undefined;
  const tz = await requestZone();
  return withUser(async (user) => {
    const { meal, entryIds } = await logMeal(user, Number(id), { tz, source: "touch", localDate });
    return { meal, ids: entryIds, day: await getHealthDay(user, localDate ?? dateIn(tz)) };
  });
}
