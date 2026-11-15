import { withUser } from "@/lib/api";
import { foodFromReference } from "@/lib/health/foods";
import { lookupReference } from "@/lib/health/reference";

export const dynamic = "force-dynamic";

/** The food table searched by what was typed: English, romaji or Japanese (§5.8). */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  return withUser(async () => ({ rows: await lookupReference(q) }));
}

/** `{ id }`: the row becomes a food in the library, or is found there already. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: unknown };
  return withUser(async (user) => {
    if (!Number.isInteger(body.id)) throw new Error("Which row?");
    return { food: await foodFromReference(user, body.id as number) };
  });
}
