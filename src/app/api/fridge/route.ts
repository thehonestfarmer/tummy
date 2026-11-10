import { withUser } from "@/lib/api";
import { changeFridge, getFridge, type FridgeKind } from "@/lib/health/fridge";

export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(() => getFridge());
}

const KINDS: FridgeKind[] = ["stocked", "set", "finished", "discarded"];

/** Stock a food, or correct what's left of it. Returns the fridge as it now stands. */
export async function POST(req: Request) {
  const { foodId, kind, grams } = (await req.json().catch(() => ({}))) as { foodId?: unknown; kind?: unknown; grams?: unknown };
  return withUser(async (user) => {
    if (typeof foodId !== "number") throw new Error("Which food?");
    if (!KINDS.includes(kind as FridgeKind)) throw new Error("Unknown action.");
    await changeFridge(user, { foodId, kind: kind as FridgeKind, grams: grams === undefined ? undefined : Number(grams) });
    return getFridge();
  });
}
