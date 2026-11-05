import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { claudeJson } from "./claude";
import { geminiJson } from "./gemini";
import { readFoodPhoto } from "./photos";
import type { Reading } from "./reading";

/**
 * Reads food photos into a `Reading`, with Claude or Gemini: label reading
 * is the step where accuracy matters most, and Groq is kept for
 * transcription and quick parsing, where speed matters (healthspec.md §9).
 *
 * Which model is not settled by assumption. Until the first seeding batch has
 * been reviewed, every draft is read by each of `visionModels()` side by
 * side, and `bun run vision:compare` scores each against what the reviewer
 * confirmed. Set HEALTH_VISION_COMPARE to empty to stop paying for the
 * second reading once a winner is picked.
 */
export function visionModels(): string[] {
  const primary = process.env.HEALTH_VISION_MODEL || "claude-opus-5";
  const compare = process.env.HEALTH_VISION_COMPARE ?? "gemini-flash-latest";
  return [...new Set([primary, ...compare.split(",").map((m) => m.trim()).filter(Boolean)])];
}

const n = () => z.number().nullable();

export const ReadingSchema = z.object({
  kind: z
    .enum(["nutrition_label", "meat_fish_pack", "not_food"])
    .describe(
      "nutrition_label: a printed 栄養成分表示 or equivalent panel is visible. " +
        "meat_fish_pack: a supermarket meat, fish or similar pack with no nutrition panel. " +
        "not_food: neither.",
    ),
  name: z
    .string()
    .describe(
      "Short everyday name, as an English speaker living in Japan would say it out loud. " +
        "Keep Japanese food words in romaji where that is what people say: 'shoyu senbei', " +
        "'maguro akami sashimi', 'beef sirloin', 'Meiji Bulgaria yogurt'. Lowercase except brand names.",
    ),
  name_ja: z.string().nullable().describe("名称 from the 一括表示, or the product name, in Japanese as printed."),
  brand: z.string().nullable().describe("Brand or maker, if visible."),
  aliases: z
    .array(z.string())
    .describe(
      "Two to five other ways someone might say this when logging it by voice: romaji, English, " +
        "shorthand ('rice crackers', 'senbei'). Do not repeat `name`.",
    ),
  net_weight_g: n().describe("内容量 in grams, exactly as printed. Read ml as grams. Null if not printed."),
  piece_count: n().describe("Number of pieces or individual packs if printed (12枚, 8個, 5袋). Null if not printed."),
  piece_unit: z.string().nullable().describe("The counter as printed: 枚, 個, 本, 袋. Null if none."),
  basis: z
    .enum(["per_100g", "per_serving", "per_package", "per_piece"])
    .nullable()
    .describe(
      "What the printed nutrition numbers refer to. 100g当たり → per_100g. 1袋当たり / 1パック当たり → per_package. " +
        "1枚当たり / 1個当たり / 1本当たり → per_piece. 1食当たり or any other portion → per_serving. Null on a pack with no panel.",
    ),
  basis_grams: n().describe(
    "The grams that basis covers, only when printed: 1枚(標準9g)当たり → 9, 1食(45g)当たり → 45, 100g当たり → 100. Null when not printed.",
  ),
  kcal: n().describe("エネルギー for the basis, exactly as printed. Do not convert to per 100g."),
  protein_g: n().describe("たんぱく質 for the basis, as printed."),
  fat_g: n().describe("脂質 for the basis, as printed."),
  carbs_g: n().describe("炭水化物 for the basis, as printed, when it is a single figure. Null when the label gives only 糖質 and 食物繊維."),
  sugar_g: n().describe("糖質, when the label splits carbohydrate. Null otherwise."),
  fiber_g: n().describe("食物繊維, when printed. Null otherwise."),
  estimate_per_100g: z
    .object({ kcal: z.number(), protein_g: z.number(), fat_g: z.number(), carbs_g: z.number() })
    .nullable()
    .describe(
      "meat_fish_pack only: your best estimate per 100g RAW for this species and cut, from standard food " +
        "composition data (日本食品標準成分表 where it applies). Null for a nutrition_label.",
    ),
  weight_basis: z
    .enum(["raw", "cooked", "as_packaged"])
    .describe("raw for uncooked meat, fish and produce; cooked if the values are for cooked food; as_packaged for ready-to-eat products."),
  reference_terms: z
    .array(z.string())
    .describe(
      "Two to four search terms for finding the generic equivalent in MEXT's 日本食品標準成分表, written the " +
        "way that table writes food names: hiragana for most foods (するめいか, せんべい, もも), kanji where the " +
        "table uses it (米菓, 牛, 豚), and the part or cut as a separate term. E.g. ['若どり', 'もも'], " +
        "['するめいか'], ['米菓', 'しょうゆせんべい'].",
    ),
  notes: z.string().describe("One sentence on anything uncertain or hard to read. Empty string if nothing."),
});

/**
 * What a reviewer submits: the same fields, but a food added by name has no
 * photo and is its own kind. The vision model never returns `named_food`.
 */
export const ReviewedReadingSchema = ReadingSchema.extend({
  kind: z.enum(["nutrition_label", "meat_fish_pack", "named_food", "not_food"]),
});

// The schemas and the shared type must not drift apart.
type _Matches = z.infer<typeof ReviewedReadingSchema> extends Reading
  ? Reading extends z.infer<typeof ReviewedReadingSchema>
    ? true
    : never
  : never;
const _check: _Matches = true;
void _check;

const SYSTEM = `You read photos of food packaging from Japanese supermarkets and convenience stores \
for a nutrition tracker. Two people photograph everything in their kitchen once, a person checks each \
reading against the photo, and from then on the saved values are the only source of truth. Your job is \
to transcribe, not to compute.

- Nutrition labels: copy the numbers from the 栄養成分表示 exactly as printed, for the basis printed \
(1袋当たり, 1枚当たり, 100g当たり, ...). Never convert to per-100g, never multiply or divide. The server \
does that. If a value is a range or marked 推定値, give the printed figure.
- Read 内容量 (net weight) and any piece count (12枚, 個包装 8個) from the 一括表示 box or the front. \
These matter: the server turns them into "1 piece" and "1 pack" servings.
- If a figure is cut off, blurred or absent, return null for it rather than guessing, and say so in notes.
- Meat and fish packs usually have no nutrition panel, only the species, cut and net weight \
(牛サーロイン, まぐろ赤身 刺身用, 国産若鶏もも肉). For these, read the name and net weight, and estimate \
per-100g RAW values for that cut.
- One or two photos of the same product may be given (usually the back, sometimes the front). Combine them.
- Salt, sodium, vitamins and other figures have no field and are not needed; leave them out of notes too.`;

type ImageSource = Extract<Anthropic.Beta.BetaImageBlockParam["source"], { type: "base64" }>;

/** The photos are private and on this server's disk, so they go as bytes. */
async function imageSource(url: string): Promise<ImageSource> {
  const bytes = await readFoodPhoto(url);
  if (!bytes) throw new Error("That photo is gone. Take it again.");
  return { type: "base64", media_type: "image/jpeg", data: bytes.toString("base64") };
}

export type ReadResult = { reading: Reading; servedBy: string; latencyMs: number };

const TASK = "read that label. Try a closer photo";

/** Goes to Gemini or Claude by the model's name; the schema and prompt are the same for both. */
export async function readFoodPhotos(model: string, imageUrls: string[]): Promise<ReadResult> {
  const images = await Promise.all(imageUrls.map(imageSource));
  if (model.startsWith("gemini-")) {
    const { output, servedBy, latencyMs } = await geminiJson({
      model,
      system: SYSTEM,
      parts: [
        ...images.map((i) => ({ inline_data: { mime_type: i.media_type, data: i.data } })),
        { text: "Read this product." },
      ],
      schema: ReadingSchema,
      task: TASK,
    });
    return { reading: output, servedBy, latencyMs };
  }
  const { output, servedBy, latencyMs } = await claudeJson({
    model,
    system: SYSTEM,
    content: [
      ...images.map((source) => ({ type: "image" as const, source })),
      { type: "text", text: "Read this product." },
    ],
    schema: ReadingSchema,
    task: TASK,
  });
  return { reading: output, servedBy, latencyMs };
}
