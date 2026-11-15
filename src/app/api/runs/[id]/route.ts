import { withUser } from "@/lib/api";
import { getHealthDay } from "@/lib/health/entries";
import { requestZone } from "@/lib/health/requestZone";
import { deleteRun } from "@/lib/health/runs";
import { dateIn } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/** Takes one of your runs back out. Answers with the day it was on. */
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const today = dateIn(await requestZone());
  return withUser(async (user) => getHealthDay(user, (await deleteRun(user, id)) ?? today));
}
