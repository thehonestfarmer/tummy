import { withUser } from "@/lib/api";
import { finishWorkout, startWorkout } from "@/lib/health/workout";
import { personIn, today, workoutFor } from "./shared";

export const dynamic = "force-dynamic";

/** A workout: the session its person is in, and what Start workout would offer (§7.4). Yours, or with `?who=` your partner's. */
export async function GET(req: Request) {
  return withUser(async (user) => workoutFor(await personIn(user, req), req));
}

/** `start` (with a plan of that person's, or none) begins a session or joins the open one; `finish` is their Finish. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { action?: unknown; planId?: unknown; rating?: unknown; note?: unknown };
  const date = await today();
  return withUser(async (user) => {
    const person = await personIn(user, req);
    if (body.action === "start") await startWorkout(person, date, typeof body.planId === "number" ? body.planId : null);
    else if (body.action === "finish") await finishWorkout(person, { rating: body.rating, note: body.note });
    else throw new Error("Unknown action.");
    return workoutFor(person, req);
  });
}
