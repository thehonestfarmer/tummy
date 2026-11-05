import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { deleteMeal, listMeals } from "@/lib/health/meals";

export const dynamic = "force-dynamic";

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  return withUser(async () => {
    await deleteMeal(Number(id));
    return listMeals();
  });
}
