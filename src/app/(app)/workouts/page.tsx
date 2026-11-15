import { redirect } from "next/navigation";
import { bothUsers, getUser } from "@/lib/auth";
import { requestZone } from "@/lib/health/requestZone";
import { getWorkouts } from "@/lib/health/workout";
import { dateIn } from "@/lib/health/zone";
import { Workouts } from "@/components/health/Workouts";

export const dynamic = "force-dynamic";

/** Routines and history (healthspec.md §8): what there is to do, and what was done. Yours, or with `?who=` your partner's. */
export default async function WorkoutsPage({ searchParams }: { searchParams: Promise<{ who?: string | string[] }> }) {
  const user = await getUser();
  if (!user) redirect("/");
  const { who } = await searchParams;
  const person = Object.values(await bothUsers()).find((u) => u.slug === who) ?? user;
  return <Workouts key={person.slug} initial={await getWorkouts(person, dateIn(await requestZone()))} />;
}
