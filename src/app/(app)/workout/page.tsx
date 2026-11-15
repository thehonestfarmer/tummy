import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { requestZone } from "@/lib/health/requestZone";
import { getWorkout } from "@/lib/health/workout";
import { dateIn } from "@/lib/health/zone";
import { Workout } from "@/components/health/Workout";

export const dynamic = "force-dynamic";

/** Workout mode (healthspec.md §7.4, §8): the session, one exercise at a time. */
export default async function WorkoutPage() {
  const user = await getUser();
  if (!user) redirect("/");
  return <Workout initial={await getWorkout(user, dateIn(await requestZone()))} />;
}
