import { withUser } from "@/lib/api";
import { getHealthDay } from "@/lib/health/entries";
import { deleteEntries } from "@/lib/health/quicklog";
import { requestZone } from "@/lib/health/requestZone";
import { dateIn } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/** The toast's Undo: exactly the entries one log just added. */
export async function POST(req: Request) {
  const { ids } = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const tz = await requestZone();
  return withUser(async (user) => {
    const list = Array.isArray(ids) ? ids.filter((i): i is number => typeof i === "number") : [];
    await deleteEntries(user, list);
    return getHealthDay(user, dateIn(tz));
  });
}
