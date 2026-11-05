import "server-only";
import { z } from "zod";
import { sql } from "../db";
import { claudeJson, textModel } from "./claude";
import { fold } from "./fold";
import type { Macros } from "./reading";

export { CROSS_CHECK_TOLERANCE, crossCheckGap, matchesRow } from "./reading";

/**
 * Matching against MEXT's food table (healthspec.md §5.8). The server finds
 * candidate rows by name; Claude only chooses among them, so a number shown
 * to the reviewer always cites a row rather than coming from the model's
 * memory.
 */

export type ReferenceRow = { id: number; foodNumber: string; name: string; per100: Macros };

type Row = {
  id: number;
  food_number: string;
  name: string;
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
};

const toRow = (r: Row): ReferenceRow => ({
  id: r.id,
  foodNumber: r.food_number,
  name: r.name,
  per100: { kcal: r.kcal ?? 0, protein_g: r.protein_g ?? 0, fat_g: r.fat_g ?? 0, carbs_g: r.carbs_g ?? 0 },
});

const MAX_CANDIDATES = 30;

/**
 * Rows whose name contains any of the terms, ranked by how many terms they
 * match and then by how short the name is: "するめいか 生" ahead of
 * "するめいか 胴 皮なし 生" when both match equally.
 */
export async function searchReference(terms: string[], limit = MAX_CANDIDATES): Promise<ReferenceRow[]> {
  const keys = [...new Set(terms.map(fold).filter((k) => k.length >= 1))];
  if (!keys.length) return [];
  const patterns = keys.map((k) => `%${k}%`);
  const rows = await sql<Row[]>`
    select id, food_number, name, kcal, protein_g, fat_g, carbs_g
    from reference_foods
    where search_key like any(${patterns})
    order by (select count(*) from unnest(${patterns}::text[]) p where search_key like p) desc,
             length(name) asc, food_number asc
    limit ${limit}`;
  return rows.map(toRow);
}

export async function referenceRows(ids: number[]): Promise<ReferenceRow[]> {
  if (!ids.length) return [];
  const rows = await sql<Row[]>`
    select id, food_number, name, kcal, protein_g, fat_g, carbs_g
    from reference_foods where id = any(${ids})`;
  const byId = new Map(rows.map((r) => [r.id, toRow(r)]));
  // In the order given, which is the matcher's ranking.
  return ids.map((id) => byId.get(id)).filter((r): r is ReferenceRow => !!r);
}

const PickSchema = z.object({
  choice: z
    .number()
    .int()
    .nullable()
    .describe("The number of the matching row from the list, or null if none of them is this food."),
  reason: z.string().describe("A short clause on why, or what is missing."),
});

export type MatchPurpose =
  /** The values will come from the row: species, cut and form must all fit. */
  | "values"
  /** A label is only being sanity-checked against the nearest generic food. */
  | "cross_check";

const SYSTEM = `You match a food to one row of MEXT's 日本食品標準成分表 (八訂), the Japanese \
standard food composition table, for a nutrition tracker. You are given the food and a numbered list of \
candidate rows found by name search. Choose only from the list; never invent a row.`;

/**
 * Picks the row for a food, or null. Never throws: matching is an
 * improvement on a draft, not a requirement for one, so a failure just
 * leaves the draft without a row.
 */
export async function pickReference(
  description: string,
  candidates: ReferenceRow[],
  purpose: MatchPurpose,
): Promise<ReferenceRow | null> {
  if (!candidates.length) return null;
  const rules =
    purpose === "values"
      ? "The row's values will be used for this food, so the species, cut or variety and the form must match. " +
        "Prefer the raw row (生) unless the food says it is cooked, dried or prepared; if it says cooked " +
        "without saying how, choose null rather than guessing between boiled, grilled and fried. With skin or " +
        "fat (皮つき / 脂身つき) is the default for meat sold that way. Choose null if nothing fits."
      : "This is a packaged product with its own label; choose the closest generic equivalent, only to " +
        "sanity-check the label's numbers. A broad match is fine (any soy-sauce rice cracker for a branded " +
        "one). Choose null only if nothing is even the same kind of food.";
  try {
    const { output } = await claudeJson({
      model: textModel(),
      effort: "low",
      system: SYSTEM,
      content: [
        {
          type: "text",
          text:
            `${rules}\n\nFood: ${description}\n\nCandidate rows:\n` +
            candidates.map((c, i) => `${i + 1}. ${c.name} (${c.per100.kcal} kcal per 100g)`).join("\n"),
        },
      ],
      schema: PickSchema,
      task: "match that food to the food table",
    });
    const i = output.choice;
    return i !== null && i >= 1 && i <= candidates.length ? candidates[i - 1] : null;
  } catch (err) {
    console.error("[tummy] reference match failed", err);
    return null;
  }
}
