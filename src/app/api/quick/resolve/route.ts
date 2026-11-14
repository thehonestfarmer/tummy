import { withUser } from "@/lib/api";
import { resolvePending } from "@/lib/health/quicklog";
import { requestZone } from "@/lib/health/requestZone";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The answer to one item quick log couldn't settle on its own. */
export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const tz = await requestZone();
  return withUser(async (user) => {
    if (typeof b.foodId !== "number") throw new Error("Which food?");
    return resolvePending(
      user,
      {
        phrase: typeof b.phrase === "string" ? b.phrase : "",
        foodId: b.foodId,
        quantity: num(b.quantity),
        unit: typeof b.unit === "string" ? b.unit : null,
        minutesAgo: num(b.minutesAgo),
        gramsPerPiece: num(b.gramsPerPiece),
        grams: num(b.grams),
        shared: b.shared === true,
        who: b.who === "me" || b.who === "both" || b.who === "partner" ? b.who : undefined,
      },
      { tz, source: b.source === "voice" ? "voice" : "touch" },
    );
  });
}
