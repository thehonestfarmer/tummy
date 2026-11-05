import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { getHealthDay } from "@/lib/health/entries";
import { logMeal } from "@/lib/health/meals";
import { requestZone } from "@/lib/health/requestZone";
import { dateIn } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/** One tap for every food in a saved meal. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const tz = await requestZone();
  return withUser(async (user) => {
    const { meal, entryIds } = await logMeal(user, Number(id), { tz, source: "touch" });
    return { meal, ids: entryIds, day: await getHealthDay(user, dateIn(tz)) };
  });
}
