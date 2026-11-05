/**
 * What a model reads off a food photo, and how the server turns that into a
 * food. Pure, with no server imports, because the review screen runs the same
 * normalisation live as the reviewer corrects a field. The server then reruns
 * it on whatever is submitted, rather than trusting the browser's numbers.
 *
 * A reading records the label **as printed**: per bag, per piece, per 100g,
 * whatever the packet says. Converting to per-100g happens in `normalize`. The
 * printed numbers are also what someone checks against the photo, and what
 * each model is scored on, so they are kept in the form the photo shows.
 */

/**
 * `named_food` is a food added by name, with no photo: "squid, raw". Like a
 * meat pack, its values are per 100g, taken from a reference-table row or,
 * failing that, estimated.
 */
export type ReadingKind = "nutrition_label" | "meat_fish_pack" | "named_food" | "not_food";
export type Basis = "per_100g" | "per_serving" | "per_package" | "per_piece";
export type WeightBasis = "raw" | "cooked" | "as_packaged";

export type Macros = { kcal: number; protein_g: number; fat_g: number; carbs_g: number };

export type Reading = {
  kind: ReadingKind;
  /** Short, as an English speaker in Japan would say it: "shoyu senbei", "beef sirloin". */
  name: string;
  /** 名称 or the product name, in Japanese, when printed. */
  name_ja: string | null;
  brand: string | null;
  /** Other ways we might refer to it: romaji, English, shorthand. */
  aliases: string[];
  /** 内容量, in grams (ml is read as grams). */
  net_weight_g: number | null;
  /** 12枚, 8個, 5袋, when printed. */
  piece_count: number | null;
  piece_unit: string | null;
  /** What the printed nutrition numbers refer to. Null on a pack with no panel. */
  basis: Basis | null;
  /** The grams that basis covers, when printed: 1枚(9g)当たり → 9. */
  basis_grams: number | null;
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  /** 炭水化物, when printed as one figure. */
  carbs_g: number | null;
  /** 糖質, when the label splits carbohydrate. */
  sugar_g: number | null;
  /** 食物繊維, when the label splits carbohydrate. */
  fiber_g: number | null;
  /**
   * Per 100g for a meat or fish pack or a named food, which carry no panel:
   * a reference-table row's values when one was chosen, otherwise the
   * model's estimate.
   */
  estimate_per_100g: Macros | null;
  weight_basis: WeightBasis;
  /** How to find this food's generic row in the reference table (§5.8). */
  reference_terms: string[];
  /** Anything the model was unsure of, in a sentence. */
  notes: string;
};

export type Serving = { label: string; grams: number };

export type Normalized = {
  per100: Macros | null;
  servings: Serving[];
  defaultGrams: number | null;
  /** Where the numbers came from, before knowing whether a table row was used. */
  source: "label_ocr" | "pack_read" | "llm_estimate";
  /** What stops this reading becoming a food, in words for the reviewer. */
  problems: string[];
};

const round = (n: number, places = 1) => Math.round(n * 10 ** places) / 10 ** places;
const positive = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n > 0;
const present = (n: number | null | undefined): n is number =>
  typeof n === "number" && Number.isFinite(n) && n >= 0;

/**
 * Total carbohydrate, which is what the targets are written in (§5.1). A
 * Japanese label that splits 糖質 and 食物繊維 is summed; fibre alone, with
 * no sugar figure, is not enough to say anything.
 */
export function totalCarbs(r: Pick<Reading, "carbs_g" | "sugar_g" | "fiber_g">): number | null {
  if (present(r.carbs_g)) return r.carbs_g;
  if (present(r.sugar_g)) return r.sugar_g + (present(r.fiber_g) ? r.fiber_g : 0);
  return null;
}

/** Grams one piece weighs: printed per piece if so, otherwise net weight ÷ count. */
function pieceGrams(r: Reading): number | null {
  if (r.basis === "per_piece" && positive(r.basis_grams)) return r.basis_grams;
  if (positive(r.net_weight_g) && positive(r.piece_count) && r.piece_count > 1) {
    return r.net_weight_g / r.piece_count;
  }
  return null;
}

/** How many grams the printed numbers are for, or null when the label doesn't say. */
export function basisGrams(r: Reading): number | null {
  switch (r.basis) {
    case "per_100g":
      return 100;
    case "per_package":
      return positive(r.basis_grams) ? r.basis_grams : positive(r.net_weight_g) ? r.net_weight_g : null;
    case "per_piece":
      return pieceGrams(r);
    case "per_serving":
      return positive(r.basis_grams) ? r.basis_grams : null;
    default:
      return null;
  }
}

export function normalize(r: Reading): Normalized {
  const problems: string[] = [];
  const source =
    r.kind === "meat_fish_pack" ? "pack_read" : r.kind === "named_food" ? "llm_estimate" : "label_ocr";
  if (r.kind === "not_food") problems.push("This doesn't look like a food label or pack.");
  if (!r.name.trim()) problems.push("Needs a name.");

  let per100: Macros | null = null;
  if (r.kind === "meat_fish_pack" || r.kind === "named_food") {
    const e = r.estimate_per_100g;
    if (e && present(e.kcal) && present(e.protein_g) && present(e.fat_g) && present(e.carbs_g)) {
      per100 = { kcal: round(e.kcal, 0), protein_g: round(e.protein_g), fat_g: round(e.fat_g), carbs_g: round(e.carbs_g) };
    } else {
      problems.push("Needs per-100g values.");
    }
  } else if (r.kind === "nutrition_label") {
    const grams = basisGrams(r);
    const carbs = totalCarbs(r);
    if (!grams) problems.push("Needs the grams the label's numbers are for.");
    if (!present(r.kcal) || !present(r.protein_g) || !present(r.fat_g) || carbs === null) {
      problems.push("Needs calories, protein, fat and carbs.");
    }
    if (grams && present(r.kcal) && present(r.protein_g) && present(r.fat_g) && carbs !== null) {
      const k = 100 / grams;
      per100 = {
        kcal: round(r.kcal * k, 0),
        protein_g: round(r.protein_g * k),
        fat_g: round(r.fat_g * k),
        carbs_g: round(carbs * k),
      };
    }
  }

  const servings: Serving[] = [];
  const piece = pieceGrams(r);
  if (piece) servings.push({ label: "piece", grams: round(piece) });
  if (positive(r.net_weight_g)) servings.push({ label: "pack", grams: round(r.net_weight_g) });
  if (r.basis === "per_serving" && positive(r.basis_grams) && !servings.some((s) => s.grams === r.basis_grams)) {
    servings.push({ label: "serving", grams: round(r.basis_grams) });
  }

  // What the log sheet pre-fills: the smallest natural unit, or a whole pack
  // when it is a single-sitting size, or simply 100g.
  const defaultGrams =
    servings.find((s) => s.label === "piece")?.grams ??
    servings.find((s) => s.label === "serving")?.grams ??
    (positive(r.net_weight_g) && r.net_weight_g <= 250 ? round(r.net_weight_g) : null) ??
    100;

  return { per100, servings, defaultGrams, source, problems };
}

/**
 * How far stated calories sit from what the macros imply (4/4/9), as a
 * fraction: 0.2 means 20% off. Above `PLAUSIBILITY_TOLERANCE` the reviewer is
 * warned, though they can still confirm. Labels round, and alcohol and
 * polyols carry calories the three macros don't, so this is a hint, not a rule.
 */
export const PLAUSIBILITY_TOLERANCE = 0.15;

export function implausibility(m: Macros): number | null {
  if (m.kcal <= 0) return null;
  const implied = m.protein_g * 4 + m.carbs_g * 4 + m.fat_g * 9;
  return Math.abs(implied - m.kcal) / m.kcal;
}

/**
 * The fields that are read off the packet, as opposed to judged. These are
 * what OCR accuracy is scored on. The English name is the model's own wording,
 * and a pack's estimate is knowledge rather than reading, so neither counts
 * here (§9).
 */
export const PRINTED_FIELDS = [
  "kind",
  "name_ja",
  "brand",
  "net_weight_g",
  "piece_count",
  "basis",
  "basis_grams",
  "kcal",
  "protein_g",
  "fat_g",
  "carbs_g",
  "sugar_g",
  "fiber_g",
] as const satisfies readonly (keyof Reading)[];

export type PrintedField = (typeof PRINTED_FIELDS)[number];

const text = (v: unknown) =>
  typeof v === "string" ? v.normalize("NFKC").replace(/\s+/g, "").toLowerCase() : v;

/** Equal as far as reading a label goes: whitespace and width don't count, rounding does. */
export function sameValue(a: unknown, b: unknown): boolean {
  if (a === null || a === undefined || a === "") return b === null || b === undefined || b === "";
  if (typeof a === "number" && typeof b === "number") return Math.abs(a - b) <= 0.01 + 0.005 * Math.abs(b);
  return text(a) === text(b);
}

/** Which printed fields two readings disagree on. */
export function differingFields(a: Reading, b: Reading): PrintedField[] {
  return PRINTED_FIELDS.filter((f) => !sameValue(a[f], b[f]));
}

/** A blank reading, for a draft whose model failed and that someone types in by hand. */
export function emptyReading(): Reading {
  return {
    kind: "nutrition_label",
    name: "",
    name_ja: null,
    brand: null,
    aliases: [],
    net_weight_g: null,
    piece_count: null,
    piece_unit: null,
    basis: "per_100g",
    basis_grams: null,
    kcal: null,
    protein_g: null,
    fat_g: null,
    carbs_g: null,
    sugar_g: null,
    fiber_g: null,
    estimate_per_100g: null,
    weight_basis: "as_packaged",
    reference_terms: [],
    notes: "",
  };
}

/** A reference-table row as far as these checks need it. */
type WithMacros = { per100: Macros };

/** How far a label's calories sit from its generic row's, as a fraction. Above this the reviewer is warned. */
export const CROSS_CHECK_TOLERANCE = 0.5;

/**
 * Catches what the calories-versus-macros check can't: a dropped decimal, or
 * a per-piece figure read as per 100g, where the macros scale along with the
 * calories and so still agree with each other (§5.8).
 */
export function crossCheckGap(label: Macros, row: WithMacros): number | null {
  if (row.per100.kcal <= 0) return null;
  return Math.abs(label.kcal - row.per100.kcal) / row.per100.kcal;
}

/** Whether per-100g values are exactly a row's, so a food can say it came from the table. */
export function matchesRow(per100: Macros, row: WithMacros): boolean {
  const close = (a: number, b: number) => Math.abs(a - b) <= 0.05;
  return (
    close(per100.kcal, row.per100.kcal) &&
    close(per100.protein_g, row.per100.protein_g) &&
    close(per100.fat_g, row.per100.fat_g) &&
    close(per100.carbs_g, row.per100.carbs_g)
  );
}
