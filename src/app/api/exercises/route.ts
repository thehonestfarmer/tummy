import { withUser } from "@/lib/api";
import { listExercises } from "@/lib/health/plans";
import { createExercise } from "@/lib/health/workout";

export const dynamic = "force-dynamic";

/** The shared exercise list (§7.2), small enough to send whole and search on the phone. */
export async function GET() {
  return withUser(async () => ({ exercises: await listExercises() }));
}

/** An exercise that isn't in the list yet, made from the workout screen. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return withUser((user) => createExercise(user, body));
}
