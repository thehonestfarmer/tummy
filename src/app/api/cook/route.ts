import { withUser } from "@/lib/api";
import { cookDish, listDishes } from "@/lib/health/cook";

export const dynamic = "force-dynamic";

/** Dishes cooked before, each as it was last made. */
export async function GET() {
  return withUser(async () => ({ dishes: await listDishes() }));
}

/** Cooks a dish: the ingredients leave the fridge and the dish goes in (§5.12). */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return withUser((user) => cookDish(user, body));
}
