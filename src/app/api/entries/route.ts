import { withUser } from "@/lib/api";
import { getHealthDay, logEntry, logShared } from "@/lib/health/entries";
import { requestZone } from "@/lib/health/requestZone";
import { dateIn, isDate } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/**
 * Logs a confirmed food by touch, and returns the day with it in: today, or
 * the past day named by `date` when adding something forgotten (§8). With
 * `partnerGrams`, it's a shared meal: the rest goes into your partner's day
 * (§5.7). `ids` is what an undo should remove.
 */
export async function POST(req: Request) {
  const { foodId, grams, partnerGrams, date } = (await req.json().catch(() => ({}))) as {
    foodId?: unknown;
    grams?: unknown;
    partnerGrams?: unknown;
    date?: unknown;
  };
  const tz = await requestZone();
  const localDate = isDate(date) ? date : undefined;
  const shown = localDate ?? dateIn(tz);
  return withUser(async (user) => {
    if (typeof foodId !== "number") throw new Error("Which food?");
    if (partnerGrams !== undefined && partnerGrams !== null) {
      const { mine, theirs } = await logShared(user, {
        foodId,
        myGrams: Number(grams) || 0,
        partnerGrams: Number(partnerGrams) || 0,
        source: "touch",
        tz,
        localDate,
      });
      const entry = mine ?? theirs;
      if (!entry) throw new Error("That amount doesn't look right.");
      return { entry, ids: mine ? [mine.id] : [], day: await getHealthDay(user, shown) };
    }
    const entry = await logEntry(user, user.id, { foodId, grams: Number(grams), source: "touch", tz, localDate });
    return { entry, ids: [entry.id], day: await getHealthDay(user, shown) };
  });
}
