import { withUser } from "@/lib/api";
import { logSet } from "@/lib/health/workout";
import { workoutFor } from "../shared";

export const dynamic = "force-dynamic";

/** Logs one set by touch into the open session. `id` is what an undo should remove. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return withUser(async (user) => {
    const id = await logSet(user, body, { source: "touch" });
    return { id, workout: await workoutFor(user, req) };
  });
}
