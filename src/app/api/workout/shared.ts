import "server-only";
import { bothUsers, type User } from "@/lib/auth";
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

/**
 * Whose workout a request is about: the caller's, or with `?who=<slug>` their
 * partner's, so one phone can start and log for both of us (§7.4). Sets
 * record who entered them.
 */
export async function personIn(user: User, req: Request): Promise<User> {
  const slug = new URL(req.url).searchParams.get("who");
  if (!slug || slug === user.slug) return user;
  const person = Object.values(await bothUsers()).find((u) => u.slug === slug);
  if (!person) throw new Error("Nobody here goes by that name.");
  return person;
}
