import { withUser } from "@/lib/api";
import { createMeal, listMeals } from "@/lib/health/meals";

export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(() => listMeals());
}

/** `{ name, shared, items: [{ foodId, grams }] }`, grams per person. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  return withUser(async (user) => ({ id: await createMeal(user, body) }));
}
