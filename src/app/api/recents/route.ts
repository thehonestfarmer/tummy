import { withUser } from "@/lib/api";
import { recentFoods } from "@/lib/health/entries";
import { listMeals } from "@/lib/health/meals";

export const dynamic = "force-dynamic";

/** What the + Food sheet shows before you type: your recent foods and the saved meals (§5.6). */
export async function GET() {
  return withUser(async (user) => ({ recents: await recentFoods(user), meals: await listMeals() }));
}
