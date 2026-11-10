import "server-only";
import { sql } from "../db";
import type { User } from "../auth";
import type { Client } from "./client";
import { getLibrary, type FoodView } from "./foods";

/*
 * The fridge (healthspec.md §5.10): one shared inventory, in grams. Stocked
 * after shopping, drawn down by anything either of us logs, and corrected by
 * hand when it drifts. Nothing here ever blocks a log.
 */

export type FridgeKind = "stocked" | "set" | "finished" | "discarded";

export type FridgeItem = {
  food: FoodView;
  /** Grams left. */
  left: number;
  /** The same amount as a count, when the food has a serving to count in: "3 packs". */
  count: { label: string; n: number } | null;
};

export type FridgeView = { items: FridgeItem[] };

type Event = { food_id: number; at: Date; kind: FridgeKind | "eaten"; grams: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * What's left of every food that has ever been stocked. The ledger and the
 * log are walked together in time order: stocking adds, a correction sets,
 * eating takes away and stops at nothing. Eating more than the fridge
 * thought was there empties it, and the next shop starts again from zero
 * rather than from a debt.
 *
 * Entries are placed by when they were written, not by when the food was
 * eaten: "an hour ago" said just after shopping still comes out of what was
 * just bought.
 */
export async function fridgeLevels(): Promise<Map<number, { left: number; changedAt: Date }>> {
  const events = await sql<Event[]>`
    select food_id, created_at as at, kind, grams from fridge_changes
    union all
    select e.food_id, e.created_at as at, 'eaten' as kind, e.grams
    from food_entries e
    where e.food_id in (select food_id from fridge_changes)
    order by at asc`;
  const levels = new Map<number, { left: number; changedAt: Date }>();
  for (const e of events) {
    const now = levels.get(e.food_id)?.left ?? 0;
    const left =
      e.kind === "stocked" ? now + e.grams : e.kind === "set" ? e.grams : e.kind === "eaten" ? Math.max(0, now - e.grams) : 0;
    levels.set(e.food_id, { left, changedAt: e.at });
  }
  return levels;
}

/** As a count in the food's first serving, when that comes out near enough to whole or half. */
function countOf(food: FoodView, left: number): FridgeItem["count"] {
  const serving = food.servings[0];
  if (!serving || !(serving.grams > 0)) return null;
  const n = Math.round((left / serving.grams) * 2) / 2;
  return n > 0 && Math.abs(n * serving.grams - left) <= serving.grams * 0.1 ? { label: serving.label, n } : null;
}

/** Everything in the house with something left, most recently touched first. */
export async function getFridge(): Promise<FridgeView> {
  const [levels, library] = await Promise.all([fridgeLevels(), getLibrary()]);
  const items = library.foods
    .map((food) => ({ food, level: levels.get(food.id) }))
    .filter((x) => x.level && x.level.left > 0)
    .sort((a, b) => b.level!.changedAt.getTime() - a.level!.changedAt.getTime())
    .map(({ food, level }) => ({ food, left: round1(level!.left), count: countOf(food, level!.left) }));
  return { items };
}

/** Puts food in, or corrects what the fridge thinks is there. Only a confirmed food can be stocked (§5.10). */
export async function changeFridge(
  me: User,
  input: { foodId: number; kind: FridgeKind; grams?: number; client?: Client },
): Promise<void> {
  const needsGrams = input.kind === "stocked" || input.kind === "set";
  const grams = needsGrams ? Number(input.grams) : 0;
  if (needsGrams && !(grams >= 0 && grams <= 100_000 && (grams > 0 || input.kind === "set"))) {
    throw new Error("That amount doesn't look right.");
  }
  const [food] = await sql<{ id: number }[]>`select id from foods where id = ${input.foodId} and status = 'confirmed'`;
  if (!food) throw new Error("That food isn't in the library yet.");
  await sql`
    insert into fridge_changes (food_id, kind, grams, user_id, client)
    values (${food.id}, ${input.kind}, ${grams}, ${me.id}, ${input.client ?? "pwa"})`;
}
