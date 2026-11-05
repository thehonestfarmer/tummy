import { z } from "zod";
import type { Reading } from "./reading";

/**
 * The label as printed (mcpspec.md §4.1): what Claude or ChatGPT submits
 * after reading a photo in a chat. Values are copied off the packet for the
 * basis printed, never converted; the server does the arithmetic.
 *
 * It maps onto the same `Reading` the app's own vision models produce, so a
 * chat submission and a PWA photo go through one normaliser, one set of
 * checks, and one review screen.
 */

const amount = (max: number) => z.number().min(0).max(max);

export const PrintedSchema = z
  .object({
    name: z.string().trim().min(1).max(120).describe("Short English name, as you'd say it when logging: 'shoyu senbei'."),
    name_ja: z.string().trim().max(120).nullish().describe("The product name as printed, in Japanese."),
    generic_name: z.string().trim().max(120).nullish().describe("名称 from the 一括表示 box, e.g. 米菓."),
    brand: z.string().trim().max(120).nullish(),
    aliases: z.array(z.string().trim().min(1).max(120)).max(10).optional()
      .describe("Other ways the person might say it when logging: romaji, shorthand."),
    kind: z
      .enum(["label", "estimate"])
      .describe(
        "label: copied from a printed nutrition panel. estimate: no panel (a meat or fish pack, loose produce, " +
          "a food named in words); Tummy takes the values from the Japanese food composition table where it can.",
      ),
    basis: z
      .enum(["per_100g", "per_100ml", "per_package", "per_serving", "per_piece"])
      .describe("What the printed values are per. An estimate is always per_100g."),
    basis_grams: amount(10_000).nullish()
      .describe("The grams that basis covers, e.g. 1袋(60g)あたり → 60. Not needed for per_100g."),
    kcal: amount(10_000),
    protein_g: amount(1_000),
    fat_g: amount(1_000),
    carbs_g: amount(1_000).nullish().describe("炭水化物, if printed as one figure."),
    sugars_g: amount(1_000).nullish().describe("糖質, if the label splits carbohydrate."),
    fiber_g: amount(1_000).nullish().describe("食物繊維, if the label splits carbohydrate."),
    net_weight_g: amount(100_000).nullish().describe("内容量, in grams (ml counts as grams)."),
    piece_count: z.number().int().positive().max(1_000).nullish().describe("e.g. 12枚 → 12, 8個 → 8."),
    weight_basis: z.enum(["raw", "cooked", "as_packaged"]).default("raw")
      .describe("raw unless the person says cooked. Packaged snacks are as_packaged."),
    reference_terms: z.array(z.string().trim().min(1).max(40)).max(4).optional()
      .describe(
        "For an estimate: search terms for the food table, written the way it writes names, mostly hiragana " +
          "with the cut or form apart: ['若どり', 'もも', '皮つき'], ['するめいか'], ['りんご'].",
      ),
  })
  .refine((p) => p.carbs_g != null || p.sugars_g != null, {
    message: "Give carbs_g, or sugars_g with fiber_g when the label splits them.",
  })
  .refine((p) => p.kind === "label" || p.basis === "per_100g", {
    message: "An estimate is always per_100g.",
  })
  .refine((p) => ["per_100g", "per_100ml", "per_package"].includes(p.basis) || p.basis_grams != null, {
    message: "Give basis_grams: how many grams the printed values are for.",
  });

export type Printed = z.infer<typeof PrintedSchema>;

/** The label as printed, as the reading every other path produces. */
export function toReading(p: Printed): Reading {
  const per100 = p.basis === "per_100g" || p.basis === "per_100ml";
  const estimate = p.kind === "estimate";
  return {
    // A pack has a net weight to make a "pack" serving from; a food named in words does not.
    kind: estimate ? (p.net_weight_g ? "meat_fish_pack" : "named_food") : "nutrition_label",
    name: p.name,
    name_ja: p.name_ja || p.generic_name || null,
    brand: p.brand || null,
    aliases: [...(p.aliases ?? []), ...(p.generic_name && p.name_ja ? [p.generic_name] : [])],
    net_weight_g: p.net_weight_g ?? null,
    piece_count: p.piece_count ?? null,
    piece_unit: null,
    // ml is read as grams throughout (§5.1), so per 100ml is per 100g.
    basis: estimate ? null : per100 ? "per_100g" : (p.basis as Exclude<Printed["basis"], "per_100g" | "per_100ml">),
    basis_grams: per100 ? 100 : (p.basis_grams ?? null),
    kcal: estimate ? null : p.kcal,
    protein_g: estimate ? null : p.protein_g,
    fat_g: estimate ? null : p.fat_g,
    carbs_g: estimate ? null : (p.carbs_g ?? null),
    sugar_g: estimate ? null : (p.sugars_g ?? null),
    fiber_g: estimate ? null : (p.fiber_g ?? null),
    estimate_per_100g: estimate
      ? {
          kcal: p.kcal,
          protein_g: p.protein_g,
          fat_g: p.fat_g,
          carbs_g: p.carbs_g ?? (p.sugars_g ?? 0) + (p.fiber_g ?? 0),
        }
      : null,
    weight_basis: p.weight_basis,
    reference_terms:
      p.reference_terms?.length
        ? p.reference_terms
        : [p.generic_name, p.name_ja, p.name].filter((t): t is string => !!t),
    notes: "",
  };
}

/** Corrections a person asks for before saying yes: any printed field, by its printed name. */
export const CorrectionSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    name_ja: z.string().trim().max(120).nullable(),
    brand: z.string().trim().max(120).nullable(),
    aliases: z.array(z.string().trim().min(1).max(120)).max(20),
    basis_grams: amount(10_000).nullable(),
    kcal: amount(10_000),
    protein_g: amount(1_000),
    fat_g: amount(1_000),
    carbs_g: amount(1_000).nullable(),
    sugars_g: amount(1_000).nullable(),
    fiber_g: amount(1_000).nullable(),
    net_weight_g: amount(100_000).nullable(),
    piece_count: z.number().int().positive().max(1_000).nullable(),
    weight_basis: z.enum(["raw", "cooked", "as_packaged"]),
  })
  .partial();

export type Correction = z.infer<typeof CorrectionSchema>;

/**
 * Applies corrections to a reading. On a label they replace the printed
 * figures; on a pack or named food, whose values are already per 100g, the
 * macros replace the per-100g values.
 */
export function corrected(r: Reading, c: Correction): Reading {
  const out: Reading = { ...r };
  if (c.name !== undefined) out.name = c.name;
  if (c.name_ja !== undefined) out.name_ja = c.name_ja;
  if (c.brand !== undefined) out.brand = c.brand;
  if (c.aliases !== undefined) out.aliases = c.aliases;
  if (c.net_weight_g !== undefined) out.net_weight_g = c.net_weight_g;
  if (c.piece_count !== undefined) out.piece_count = c.piece_count;
  if (c.weight_basis !== undefined) out.weight_basis = c.weight_basis;
  if (r.kind === "nutrition_label") {
    if (c.basis_grams !== undefined) out.basis_grams = c.basis_grams;
    if (c.kcal !== undefined) out.kcal = c.kcal;
    if (c.protein_g !== undefined) out.protein_g = c.protein_g;
    if (c.fat_g !== undefined) out.fat_g = c.fat_g;
    if (c.carbs_g !== undefined) out.carbs_g = c.carbs_g;
    if (c.sugars_g !== undefined) out.sugar_g = c.sugars_g;
    if (c.fiber_g !== undefined) out.fiber_g = c.fiber_g;
  } else if (out.estimate_per_100g) {
    const e = { ...out.estimate_per_100g };
    if (c.kcal !== undefined) e.kcal = c.kcal;
    if (c.protein_g !== undefined) e.protein_g = c.protein_g;
    if (c.fat_g !== undefined) e.fat_g = c.fat_g;
    if (c.carbs_g != null) e.carbs_g = c.carbs_g;
    out.estimate_per_100g = e;
  }
  return out;
}
