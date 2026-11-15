import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { addServing } from "@/lib/health/foods";

export const dynamic = "force-dynamic";

/** `{ label, grams }`: one more unit this food can be counted in. Returns the food. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^\d+$/.test(id)) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => null);
  return withUser(() => addServing(Number(id), body));
}
