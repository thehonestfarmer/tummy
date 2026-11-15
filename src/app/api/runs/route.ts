import { withUser } from "@/lib/api";
import { getHealthDay } from "@/lib/health/entries";
import { requestZone } from "@/lib/health/requestZone";
import { logRun, recentRuns } from "@/lib/health/runs";
import { dateIn } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/** Your latest runs, newest first (§7.6). */
export async function GET() {
  return withUser(async (user) => ({ runs: await recentRuns(user.id) }));
}

/** `{ date, km, seconds?, kcal?, name?, fromShot? }`: one run of yours. Answers with the run and the day it changed. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const today = dateIn(await requestZone());
  return withUser(async (user) => {
    const run = await logRun(user, today, body, { source: body.fromShot ? "screenshot" : "touch" });
    return { run, day: await getHealthDay(user, run.date) };
  });
}
