import { withUser } from "@/lib/api";
import { getMaintenance, setProfile, setTarget } from "@/lib/health/maintenance";
import { requestZone } from "@/lib/health/requestZone";
import { dateIn } from "@/lib/health/zone";

export const dynamic = "force-dynamic";

/** Your maintenance estimate, what it rests on, and the target it suggests (§6.3, §6.4). */
export async function GET() {
  const today = dateIn(await requestZone());
  return withUser((user) => getMaintenance(user, today));
}

/**
 * `{ action: "profile", ... }` saves your height, birth year, sex, activity and goal.
 * `{ action: "target", kcal, protein_g, fat_g, carbs_g }` sets your target from today.
 * `{ action: "approve" }` sets it to the one the estimate suggests.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const today = dateIn(await requestZone());
  return withUser(async (user) => {
    if (body.action === "profile") await setProfile(user, body);
    else if (body.action === "target") await setTarget(user, today, body, "Set in Settings");
    else if (body.action === "approve") {
      const m = await getMaintenance(user, today);
      if (!m.proposed) throw new Error("There's nothing to change: the target already fits.");
      await setTarget(user, today, m.proposed, `From a maintenance estimate of ${m.estimate} kcal and a goal of ${m.profile.goalKgWeek} kg a week`);
    } else throw new Error("Unknown action.");
    return getMaintenance(user, today);
  });
}
