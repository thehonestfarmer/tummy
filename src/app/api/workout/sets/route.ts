import { withUser } from "@/lib/api";
import { logSet } from "@/lib/health/workout";
import { personIn, workoutFor } from "../shared";

export const dynamic = "force-dynamic";

/** Logs one set by touch into the open session, for yourself or with `?who=` your partner. `id` is what an undo should remove. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return withUser(async (user) => {
    const person = await personIn(user, req);
    const id = await logSet(person, body, { source: "touch", enteredBy: user });
    return { id, workout: await workoutFor(person, req) };
  });
}
