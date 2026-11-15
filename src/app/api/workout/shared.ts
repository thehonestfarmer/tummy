import "server-only";
import type { User } from "@/lib/auth";
import { requestZone } from "@/lib/health/requestZone";
import { getWorkout } from "@/lib/health/workout";
import { dateIn } from "@/lib/health/zone";

/** Exercises added on the screen but not yet done ride along in `?add=1,2`, since nothing stores them (§7.4). */
export function addedIn(req: Request): number[] {
  const raw = new URL(req.url).searchParams.get("add") ?? "";
  return raw.split(",").map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 20);
}

export const today = async () => dateIn(await requestZone());

/** Every workout write answers with the workout as it now stands. */
export const workoutFor = async (user: User, req: Request) => getWorkout(user, await today(), addedIn(req));
