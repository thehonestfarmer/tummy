import { withUser } from "@/lib/api";
import { getWorkouts } from "@/lib/health/workout";
import { personIn, today } from "../workout/shared";

export const dynamic = "force-dynamic";

/** The Workouts screen (§8): today, the routines and the history, for you or with `?who=` your partner. */
export async function GET(req: Request) {
  return withUser(async (user) => getWorkouts(await personIn(user, req), await today()));
}
