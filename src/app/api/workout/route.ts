import { withUser } from "@/lib/api";
import { finishWorkout, startWorkout } from "@/lib/health/workout";
import { today, workoutFor } from "./shared";

export const dynamic = "force-dynamic";

/** The caller's workout: the session they are in, and what Start workout would offer (§7.4). */
export async function GET(req: Request) {
  return withUser((user) => workoutFor(user, req));
}

/** `start` (with a plan of yours, or none) begins a session or joins the open one; `finish` is your Finish. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; planId?: unknown; rating?: unknown; note?: unknown };
  const date = await today();
  return withUser(async (user) => {
    if (body.action === "start") await startWorkout(user, date, typeof body.planId === "number" ? body.planId : null);
    else if (body.action === "finish") await finishWorkout(user, { rating: body.rating, note: body.note });
    else throw new Error("Unknown action.");
    return workoutFor(user, req);
  });
}
