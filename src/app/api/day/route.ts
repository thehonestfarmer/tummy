import { withUser } from "@/lib/api";
import { getHealthDay } from "@/lib/health/entries";
import { requestZone } from "@/lib/health/requestZone";
import { dateIn, isDate } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/** Both of your days: `?date=YYYY-MM-DD`, or today in this phone's zone. */
export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("date");
  const tz = await requestZone();
  return withUser((user) => getHealthDay(user, isDate(asked) ? asked : dateIn(tz)));
}
