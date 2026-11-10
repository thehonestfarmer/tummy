import { withUser } from "@/lib/api";
import { getHealthDay, partnerOf } from "@/lib/health/entries";
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
  return withUser(async (user) =>
    getHealthDay(params.get("who") === "partner" ? await partnerOf(user) : user, isDate(asked) ? asked : dateIn(tz)),
  );
}
