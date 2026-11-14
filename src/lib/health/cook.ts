import "server-only";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import { fridgeLevels } from "./fridge";

/*
 * Cooking (healthspec.md §5.12). Ingredients come out of the fridge, and one
 * dish goes in, counted in portions. The dish is an ordinary food, so eating
 * it, splitting it and correcting what's left all work as they do for
 * anything else.
 */

export type DishView = {
  /** The dish's food. */
  foodId: number;
  name: string;
  portions: number;
  cookedGrams: number | null;
  items: { foodId: number; name: string; grams: number }[];
};

const CookSchema = z.object({
  name: z.string().trim().min(1).max(120),
  portions: z.number().positive().max(100),
  cookedGrams: z.number().positive().max(100_000).nullable().optional(),
  items: z.array(z.object({ foodId: z.number().int(), grams: z.number().positive().max(100_000) })).min(1).max(40),
});

const round1 = (n: number) => Math.round(n * 10) / 10;

/** Every dish cooked before, as it was last made, most recent first. */
export async function listDishes(): Promise<DishView[]> {
  const cooks = await sql<{ id: number; food_id: number; name: string; portions: number; cooked_grams: number | null }[]>`
    select distinct on (c.food_id) c.id, c.food_id, f.name, c.portions, c.cooked_grams
    from cooks c join foods f on f.id = c.food_id
    order by c.food_id, c.created_at desc, c.id desc`;
  if (!cooks.length) return [];
  const items = await sql<{ cook_id: number; food_id: number; name: string; grams: number }[]>`
    select i.cook_id, i.food_id, f.name, i.grams
    from cook_items i join foods f on f.id = i.food_id
    where i.cook_id = any(${cooks.map((c) => c.id)})
    order by i.cook_id, i.position, i.id`;
  return cooks
    .sort((a, b) => b.id - a.id)
    .map((c) => ({
      foodId: c.food_id,
      name: c.name,
      portions: c.portions,
      cookedGrams: c.cooked_grams,
      items: items.filter((i) => i.cook_id === c.id).map((i) => ({ foodId: i.food_id, name: i.name, grams: i.grams })),
    }));
}

/**
 * Cooks a dish. Its per-100g values are the ingredients' totals over the
 * dish's weight: the finished pot if it was weighed, the raw weights added
 * up if not. Either way a portion carries its exact share of the pot.
 *
 * A dish cooked before, under the same name, is the same food: it takes
 * this batch's numbers and the new portions join whatever was left. Entries
 * already logged keep the numbers they were logged with (§5.4).
 */
export async function cookDish(me: User, raw: unknown): Promise<{ foodId: number; name: string; portions: number }> {
  const parsed = CookSchema.safeParse(raw);
  if (!parsed.success) throw new Error("A dish needs a name, its ingredients, and how many portions it made.");
  const c = parsed.data;

  // The same ingredient twice is one ingredient.
  const amounts = new Map<number, number>();
  for (const item of c.items) amounts.set(item.foodId, (amounts.get(item.foodId) ?? 0) + item.grams);
  const ids = [...amounts.keys()];

  const [rows, levels] = await Promise.all([
    sql<{ id: number; kcal: number; protein_g: number; fat_g: number; carbs_g: number }[]>`
      select id, kcal, protein_g, fat_g, carbs_g from foods where id = any(${ids}) and status = 'confirmed'`,
    fridgeLevels(),
  ]);
  if (rows.length !== ids.length) throw new Error("One of those foods is no longer in the library.");

  const total = { grams: 0, kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
  for (const r of rows) {
    const g = amounts.get(r.id)!;
    total.grams += g;
    total.kcal += (r.kcal * g) / 100;
    total.protein_g += (r.protein_g * g) / 100;
    total.fat_g += (r.fat_g * g) / 100;
    total.carbs_g += (r.carbs_g * g) / 100;
  }
  const weight = c.cookedGrams ?? total.grams;
  const per100 = (n: number) => round1((n / weight) * 100);
  const portionGrams = round1(weight / c.portions);
  const basis = c.cookedGrams ? "cooked" : "raw";

  const foodId = await sql.begin(async (tx) => {
    const [existing] = await tx<{ id: number; source: string | null }[]>`
      select id, source from foods where lower(name) = lower(${c.name}) and status = 'confirmed' for update`;
    if (existing && existing.source !== "recipe") throw new Error(`There's already a food called ${c.name}. Give the dish another name.`);
    if (existing && amounts.has(existing.id)) throw new Error("A dish can't be an ingredient of itself. Give this one another name.");

    let id: number;
    if (existing) {
      id = existing.id;
      await tx`
        update foods set kcal = ${per100(total.kcal)}, protein_g = ${per100(total.protein_g)}, fat_g = ${per100(total.fat_g)},
          carbs_g = ${per100(total.carbs_g)}, weight_basis = ${basis}, default_grams = ${portionGrams}, updated_at = now()
        where id = ${id}`;
    } else {
      [{ id }] = await tx<{ id: number }[]>`
        insert into foods (name, kcal, protein_g, fat_g, carbs_g, weight_basis, default_grams,
                           source, client, status, created_by, confirmed_by, confirmed_via, confirmed_at)
        values (${c.name}, ${per100(total.kcal)}, ${per100(total.protein_g)}, ${per100(total.fat_g)}, ${per100(total.carbs_g)},
                ${basis}, ${portionGrams}, 'recipe', 'pwa', 'confirmed', ${me.id}, ${me.id}, 'pwa', now())
        returning id`;
    }
    await tx`delete from food_servings where food_id = ${id}`;
    await tx`insert into food_servings (food_id, label, grams) values (${id}, 'portion', ${portionGrams})`;

    const [{ id: cookId }] = await tx<{ id: number }[]>`
      insert into cooks (food_id, portions, cooked_grams, user_id)
      values (${id}, ${c.portions}, ${c.cookedGrams ?? null}, ${me.id}) returning id`;
    for (const [position, [ingredient, grams]] of [...amounts].entries()) {
      await tx`insert into cook_items (cook_id, food_id, grams, position) values (${cookId}, ${ingredient}, ${grams}, ${position})`;
      // Only what the fridge holds can leave it: oil and sauces are never stocked (§5.10).
      if ((levels.get(ingredient)?.left ?? 0) > 0) {
        await tx`insert into fridge_changes (food_id, kind, grams, user_id) values (${ingredient}, 'cooked', ${grams}, ${me.id})`;
      }
    }
    await tx`insert into fridge_changes (food_id, kind, grams, user_id) values (${id}, 'stocked', ${weight}, ${me.id})`;
    return id;
  });

  return { foodId, name: c.name, portions: c.portions };
}
