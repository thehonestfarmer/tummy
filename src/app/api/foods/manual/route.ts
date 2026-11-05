import { withUser } from "@/lib/api";
import { createManualFood } from "@/lib/health/foods";

export const dynamic = "force-dynamic";

/** A food from typed-in per-100g numbers, confirmed as it is created. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return withUser(async (user) => ({ id: await createManualFood(user, body) }));
}
