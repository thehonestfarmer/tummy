import type { Macros } from "./reading";

/*
 * How much of a food fits the meal in front of you (healthspec.md §5.13).
 * What is left of the day's target is shared out over the meals still to
 * come, and a food fits up to the first thing it would use up: calories
 * always, and whichever macro the food is mostly made of. Chicken stops at
 * protein and rice at carbohydrate; neither is held back by the trace of
 * the other it carries.
 */

export const NOTHING: Macros = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

const KEYS = ["kcal", "protein_g", "fat_g", "carbs_g"] as const;
type Key = (typeof KEYS)[number];
const KCAL_PER_G: Record<Exclude<Key, "kcal">, number> = { protein_g: 4, fat_g: 9, carbs_g: 4 };
/** A macro limits a food only when it supplies at least this share of the food's calories. */
const MAIN_SHARE = 0.3;

export const WORD: Record<Key, string> = { kcal: "calories", protein_g: "protein", fat_g: "fat", carbs_g: "carbs" };

/** Meals still to come, guessed from the clock: three in the morning, two until mid-afternoon, then one. */
export const mealsAt = (hour: number) => (hour < 11 ? 3 : hour < 16 ? 2 : 1);

export const plus = (a: Macros, b: Macros): Macros => ({
  kcal: a.kcal + b.kcal,
  protein_g: a.protein_g + b.protein_g,
  fat_g: a.fat_g + b.fat_g,
  carbs_g: a.carbs_g + b.carbs_g,
});

export const of = (per100: Macros, grams: number): Macros => ({
  kcal: (per100.kcal * grams) / 100,
  protein_g: (per100.protein_g * grams) / 100,
  fat_g: (per100.fat_g * grams) / 100,
  carbs_g: (per100.carbs_g * grams) / 100,
});

export const times = (m: Macros, n: number): Macros => of(m, 100 * n);

/** What is left of a room once something has gone into it, never below nothing. */
export const less = (room: Macros, used: Macros): Macros => ({
  kcal: Math.max(0, room.kcal - used.kcal),
  protein_g: Math.max(0, room.protein_g - used.protein_g),
  fat_g: Math.max(0, room.fat_g - used.fat_g),
  carbs_g: Math.max(0, room.carbs_g - used.carbs_g),
});

/**
 * One person's room for this meal: what is left of the day, less anything
 * already chosen for this meal, over the meals still to come. Null with no target.
 */
export function roomFor(side: { totals: Macros; target: Macros | null }, meals: number, ahead: Macros = NOTHING): Macros | null {
  if (!side.target) return null;
  const room = { ...NOTHING };
  for (const k of KEYS) room[k] = Math.max(0, (side.target[k] - side.totals[k]) / Math.max(1, meals) - ahead[k]);
  return room;
}

/** The most grams of a food that fit a room, and what stops it there. */
export function fit(per100: Macros, room: Macros): { grams: number; by: Key } {
  let best: { grams: number; by: Key } = { grams: per100.kcal > 0 ? (room.kcal / per100.kcal) * 100 : Infinity, by: "kcal" };
  for (const k of ["protein_g", "fat_g", "carbs_g"] as const) {
    if (!(per100[k] > 0) || !(per100.kcal > 0) || (per100[k] * KCAL_PER_G[k]) / per100.kcal < MAIN_SHARE) continue;
    const grams = (room[k] / per100[k]) * 100;
    if (grams < best.grams) best = { grams, by: k };
  }
  return Number.isFinite(best.grams) ? best : { grams: 0, by: "kcal" };
}
