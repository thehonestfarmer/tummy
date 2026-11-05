import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { deleteFood, getFood, updateFood } from "@/lib/health/foods";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function foodId(ctx: Ctx): Promise<number | null> {
  const { id } = await ctx.params;
  return /^\d+$/.test(id) ? Number(id) : null;
}

const notFound = () => NextResponse.json({ error: "not found" }, { status: 404 });

export async function GET(_req: Request, ctx: Ctx) {
  const id = await foodId(ctx);
  if (id === null) return notFound();
  return withUser(async () => {
    const food = await getFood(id);
    if (!food) throw new Error("That food is no longer in the library.");
    return food;
  });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const id = await foodId(ctx);
  if (id === null) return notFound();
  const body = await req.json().catch(() => null);
  return withUser(() => updateFood(id, body));
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const id = await foodId(ctx);
  if (id === null) return notFound();
  return withUser(async () => {
    await deleteFood(id);
    return { deleted: true };
  });
}
