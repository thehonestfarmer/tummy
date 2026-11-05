import "server-only";
import { z } from "zod";
import { claudeJson, textModel } from "./claude";
import type { Reading } from "./reading";

/**
 * Turns a food named in words ("squid, raw", "apple", "chicken breast,
 * skinless") into a reading: its names, its form, how to find it in the
 * reference table, and an estimate to fall back on only if no row fits
 * (healthspec.md §5.2, item 3).
 */

const NamedSchema = z.object({
  name: z
    .string()
    .describe(
      "Short everyday name as an English speaker living in Japan would say it, keeping Japanese food words in " +
        "romaji where that is what people say. Include the form when it matters: 'squid, raw', 'rice, cooked'.",
    ),
  name_ja: z.string().nullable().describe("The usual Japanese name, e.g. するめいか, 鶏むね肉 皮なし."),
  aliases: z.array(z.string()).describe("Two to five other ways someone might say it when logging by voice."),
  weight_basis: z
    .enum(["raw", "cooked", "as_packaged"])
    .describe("raw unless the words say cooked or prepared. Dried foods are as_packaged."),
  reference_terms: z
    .array(z.string())
    .describe(
      "Two to four search terms for MEXT's 日本食品標準成分表, written the way that table writes names: hiragana " +
        "for most foods (するめいか, りんご, もも), kanji where the table uses it (米, 牛, 豚), the part or cut as a " +
        "separate term. E.g. ['若どり', 'むね', '皮なし'], ['するめいか'], ['りんご'].",
    ),
  estimate_per_100g: z
    .object({ kcal: z.number(), protein_g: z.number(), fat_g: z.number(), carbs_g: z.number() })
    .describe(
      "Your best per-100g estimate in the stated form (raw if unstated), with total carbohydrate. Only used if " +
        "the table has no matching row, and then flagged as an estimate.",
    ),
  notes: z.string().describe("One sentence if the name is ambiguous (which species, which cut). Empty otherwise."),
});

const SYSTEM = `You help a two-person nutrition tracker in Japan add a food by name. Interpret what \
they said as one specific food. They weigh food raw, so assume raw unless they say otherwise. Treat a dried \
food (するめ, dried fruit, katsuobushi) as a different food from the fresh one.`;

export async function interpretName(text: string): Promise<{ reading: Reading; servedBy: string; latencyMs: number }> {
  const { output, servedBy, latencyMs } = await claudeJson({
    model: textModel(),
    effort: "low",
    system: SYSTEM,
    content: [{ type: "text", text: `Food: ${text}` }],
    schema: NamedSchema,
    task: "work out which food that is",
  });
  return {
    reading: {
      kind: "named_food",
      name: output.name,
      name_ja: output.name_ja,
      brand: null,
      aliases: output.aliases,
      net_weight_g: null,
      piece_count: null,
      piece_unit: null,
      basis: null,
      basis_grams: null,
      kcal: null,
      protein_g: null,
      fat_g: null,
      carbs_g: null,
      sugar_g: null,
      fiber_g: null,
      estimate_per_100g: output.estimate_per_100g,
      weight_basis: output.weight_basis,
      reference_terms: output.reference_terms,
      notes: output.notes,
    },
    servedBy,
    latencyMs,
  };
}
