import { withUser } from "@/lib/api";
import { deleteSet, updateSet } from "@/lib/health/workout";
import { personIn, workoutFor } from "../../shared";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Corrects a set, today's or an old one, yours or with `?who=` your partner's: its numbers, its reps in reserve, or whether it was a warm-up. */
export async function PATCH(req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  const body = await req.json().catch(() => ({}));
  return withUser(async (user) => {
    const person = await personIn(user, req);
    await updateSet(person, id, body);
    return { workout: await workoutFor(person, req) };
  });
}

export async function DELETE(req: Request, ctx: Ctx) {
  const id = Number((await ctx.params).id);
  return withUser(async (user) => {
    const person = await personIn(user, req);
    await deleteSet(person, id);
    return { workout: await workoutFor(person, req) };
  });
}
