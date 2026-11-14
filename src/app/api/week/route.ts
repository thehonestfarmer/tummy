import { withUser } from "@/lib/api";
import { requestZone } from "@/lib/health/requestZone";
import { getWeek } from "@/lib/health/week";
import { dateIn, isDate } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/** The calendar week around `?date=YYYY-MM-DD`, or around today in this phone's zone (§8). */
export async function GET(req: Request) {
  const asked = new URL(req.url).searchParams.get("date");
  const today = dateIn(await requestZone());
  return withUser(async (user) => getWeek(user, isDate(asked) ? asked : today, today));
}
