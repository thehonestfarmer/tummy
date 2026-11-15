import { withUser } from "@/lib/api";
import { getHealthDay } from "@/lib/health/entries";
import { requestZone } from "@/lib/health/requestZone";
import { clearWaist, setWaist } from "@/lib/health/weight";
import { dateIn, isDate } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/** `{ cm, date? }`: your waist for today, or for a past day. Answers with that day. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { cm?: unknown; date?: unknown };
  const today = dateIn(await requestZone());
  return withUser(async (user) => {
    const date = await setWaist(user, today, { cm: body.cm, date: isDate(body.date) ? body.date : today });
    return getHealthDay(user, date);
  });
}

/** `?date=`: takes that day's measurement back out. Answers with that day. */
export async function DELETE(req: Request) {
  const asked = new URL(req.url).searchParams.get("date");
  const today = dateIn(await requestZone());
  return withUser(async (user) => {
    const date = isDate(asked) ? asked : today;
    await clearWaist(user, date);
    return getHealthDay(user, date);
  });
}
