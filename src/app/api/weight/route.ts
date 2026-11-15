import { withUser } from "@/lib/api";
import { getHealthDay } from "@/lib/health/entries";
import { requestZone } from "@/lib/health/requestZone";
import { clearWeight, getWeightTrend, setWeight } from "@/lib/health/weight";
import { dateIn, isDate } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/** Your last eight weeks of weigh-ins with their 7-day average (§6.2). */
export async function GET() {
  const today = dateIn(await requestZone());
  return withUser((user) => getWeightTrend(user, today));
}

/** `{ kg, date? }`: your weigh-in for today, or for a past day that was missed. Answers with that day. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { kg?: unknown; date?: unknown };
  const today = dateIn(await requestZone());
  return withUser(async (user) => {
    const date = await setWeight(user, today, { kg: body.kg, date: isDate(body.date) ? body.date : today });
    return getHealthDay(user, date);
  });
}

/** `?date=`: takes that day's weigh-in back out. Answers with that day. */
export async function DELETE(req: Request) {
  const asked = new URL(req.url).searchParams.get("date");
  const today = dateIn(await requestZone());
  return withUser(async (user) => {
    const date = isDate(asked) ? asked : today;
    await clearWeight(user, date);
    return getHealthDay(user, date);
  });
}
