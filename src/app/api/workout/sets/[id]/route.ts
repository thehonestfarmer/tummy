import { withUser } from "@/lib/api";
import { deleteSet, updateSet } from "@/lib/health/workout";
import { workoutFor } from "../../shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Corrects one of your sets: its numbers, its reps in reserve, or whether it was a warm-up. */
export async function PATCH(req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  return withUser(async (user) => {
    await updateSet(user, id, body);
    return { workout: await workoutFor(user, req) };
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  return withUser(async (user) => {
    await deleteSet(user, id);
    return { workout: await workoutFor(user, req) };
  });
}
