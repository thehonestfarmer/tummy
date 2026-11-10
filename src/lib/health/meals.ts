import "server-only";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import type { Client } from "./client";
import { logEntry, logShared, type EntrySource } from "./entries";

/**
 * Saved meals (healthspec.md §5.6): "usual lunch", one tap for several
 * foods. Grams are per person; a shared meal logs the list into both days.
 */

export type MealView = {
  id: number;
  name: string;
  shared: boolean;
  items: { foodId: number; name: string; grams: number; kcal: number }[];
  kcal: number;
};

type ItemRow = { meal_id: number; food_id: number; name: string; grams: number; kcal: number };

export async function listMeals(): Promise<MealView[]> {
  const [meals, items] = await Promise.all([
    sql<{ id: number; name: string; shared: boolean }[]>`select id, name, shared from saved_meals order by lower(name)`,
    sql<ItemRow[]>`
      select i.meal_id, i.food_id, f.name, i.grams, f.kcal
      from saved_meal_items i join foods f on f.id = i.food_id
      order by i.meal_id, i.position, i.id`,
  ]);
  return meals.map((m) => {
    const mine = items
      .filter((i) => i.meal_id === m.id)
      .map((i) => ({ foodId: i.food_id, name: i.name, grams: i.grams, kcal: Math.round((i.kcal * i.grams) / 100) }));
    return { ...m, items: mine, kcal: mine.reduce((n, i) => n + i.kcal, 0) };
  });
}

const MealSchema = z.object({
  name: z.string().trim().min(1).max(60),
  shared: z.boolean(),
  items: z.array(z.object({ foodId: z.number().int(), grams: z.number().positive().max(10_000) })).min(1).max(20),
});

export async function createMeal(me: User, raw: unknown): Promise<number> {
  const parsed = MealSchema.safeParse(raw);
  if (!parsed.success) throw new Error("A meal needs a name and at least one food.");
  const m = parsed.data;
  return sql.begin(async (tx) => {
    const [taken] = await tx`select 1 from saved_meals where lower(name) = lower(${m.name})`;
    if (taken) throw new Error(`There's already a meal called ${m.name}.`);
    const [{ id }] = await tx<{ id: number }[]>`
      insert into saved_meals (name, shared, created_by) values (${m.name}, ${m.shared}, ${me.id}) returning id`;
    for (const [i, item] of m.items.entries()) {
      await tx`insert into saved_meal_items (meal_id, food_id, grams, position) values (${id}, ${item.foodId}, ${item.grams}, ${i})`;
    }
    return id;
  });
}

export async function deleteMeal(id: number) {
  await sql`delete from saved_meals where id = ${id}`;
}

/** Logs every food in a meal, in one transaction so an undo takes them together. */
export async function logMeal(me: User, mealId: number, ctx: { tz: string; source: EntrySource; client?: Client; inputText?: string; loggedAt?: Date; localDate?: string }) {
  const meal = (await listMeals()).find((m) => m.id === mealId);
  if (!meal) throw new Error("That meal is gone.");
  const ids: number[] = [];
  await sql.begin(async (tx) => {
    for (const item of meal.items) {
      const base = { foodId: item.foodId, source: ctx.source, client: ctx.client, tz: ctx.tz, loggedAt: ctx.loggedAt, localDate: ctx.localDate, inputText: ctx.inputText ?? meal.name };
      if (meal.shared) {
        const { mine } = await logShared(me, { ...base, myGrams: item.grams, partnerGrams: item.grams }, tx);
        if (mine) ids.push(mine.id);
      } else {
        ids.push((await logEntry(me, me.id, { ...base, grams: item.grams }, tx)).id);
      }
    }
  });
  return { meal, entryIds: ids };
}
