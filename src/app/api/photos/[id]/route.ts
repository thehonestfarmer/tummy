import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { readFoodPhoto } from "@/lib/health/photos";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** A food photo waiting for review, for the two of us only (healthspec.md §5.3). */
export async function GET(_req: Request, ctx: Ctx) {
  if (!(await getUser())) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const bytes = await readFoodPhoto((await ctx.params).id);
  if (!bytes) return NextResponse.json({ error: "not found" }, { status: 404 });
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/jpeg",
      // Its id never points at different bytes, but it is private.
      "Cache-Control": "private, max-age=86400, immutable",
    },
  });
}
