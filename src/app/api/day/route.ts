import { withUser } from "@/lib/api";
import { getHealthDay, partnerOf } from "@/lib/health/entries";
import { NO_WEIGHT } from "@/lib/health/weight";
import { requestZone } from "@/lib/health/requestZone";
import { dateIn, isDate } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/**
 * Both of your days: `?date=YYYY-MM-DD`, or today in this phone's zone.
 * `?who=partner` turns it round: their day in full, to look at (§8).
 */
export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  const asked = params.get("date");
  const tz = await requestZone();
  return withUser(async (user) => {
    const date = isDate(asked) ? asked : dateIn(tz);
    if (params.get("who") !== "partner") return getHealthDay(user, date);
    // Their food is ours to look at; their weight is their own (§6.2).
    return { ...(await getHealthDay(await partnerOf(user), date)), weight: NO_WEIGHT };
  });
}
