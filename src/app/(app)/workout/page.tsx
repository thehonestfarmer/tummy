import { redirect } from "next/navigation";
import { bothUsers, getUser } from "@/lib/auth";
import { requestZone } from "@/lib/health/requestZone";
import { getWorkout } from "@/lib/health/workout";
import { dateIn } from "@/lib/health/zone";
import { Workout } from "@/components/health/Workout";

export const dynamic = "force-dynamic";

/** Workout mode (healthspec.md §7.4, §8): the session, one exercise at a time. Yours, or with `?who=` your partner's. */
export default async function WorkoutPage({ searchParams }: { searchParams: Promise<{ who?: string | string[] }> }) {
  const user = await getUser();
  if (!user) redirect("/");
  const { who } = await searchParams;
  const person = Object.values(await bothUsers()).find((u) => u.slug === who) ?? user;
  return <Workout key={person.slug} initial={await getWorkout(person, dateIn(await requestZone()))} />;
}
