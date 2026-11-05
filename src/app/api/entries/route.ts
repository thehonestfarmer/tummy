import { withUser } from "@/lib/api";
import { getHealthDay, logEntry, logShared } from "@/lib/health/entries";
import { requestZone } from "@/lib/health/requestZone";
import { dateIn } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/**
 * Logs a confirmed food by touch, and returns today with it in. With
 * `partnerGrams`, it's a shared meal: the rest goes into your partner's day
 * (§5.7). `ids` is what an undo should remove.
 */
export async function POST(req: Request) {
  const { foodId, grams, partnerGrams } = (await req.json().catch(() => ({}))) as {
    foodId?: unknown;
    grams?: unknown;
    partnerGrams?: unknown;
  };
  const tz = await requestZone();
  return withUser(async (user) => {
    if (typeof foodId !== "number") throw new Error("Which food?");
    if (partnerGrams !== undefined && partnerGrams !== null) {
      const { mine, theirs } = await logShared(user, {
        foodId,
        myGrams: Number(grams) || 0,
        partnerGrams: Number(partnerGrams) || 0,
        source: "touch",
        tz,
      });
      const entry = mine ?? theirs;
      if (!entry) throw new Error("That amount doesn't look right.");
      return { entry, ids: mine ? [mine.id] : [], day: await getHealthDay(user, dateIn(tz)) };
    }
    const entry = await logEntry(user, user.id, { foodId, grams: Number(grams), source: "touch", tz });
    return { entry, ids: [entry.id], day: await getHealthDay(user, dateIn(tz)) };
  });
}
