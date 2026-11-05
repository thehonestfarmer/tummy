import "server-only";
import { z } from "zod";
import { groqJson } from "./groq";

/**
 * The first step of quick log (healthspec.md §5.5): one sentence into
 * structured items. The model only says what was said; it never decides
 * which food it is or how many grams that makes. Matching and counting are
 * the server's (§1, idea 3).
 */

const Item = z.strictObject({
  phrase: z.string().describe("The food as said, without the amount or time: 'shoyu senbei', 'greek yogurt'."),
  quantity: z.number().nullable().describe("The number said: 1, 2, 0.5. Null if no number was said."),
  unit: z
    .string()
    .nullable()
    .describe(
      "The unit word as said, singular: 'g', 'kg', 'ml', 'piece', 'pack', 'bowl', 'cup', 'slice', 'handful', 'tbsp'. " +
        "Null for a bare count ('2 eggs').",
    ),
  minutes_ago: z
    .number()
    .nullable()
    .describe("If a time was given: how many minutes before now. 'an hour ago' → 60. 'just had' or nothing → null."),
});

export const ParseSchema = z.strictObject({
  intent: z
    .enum(["log", "set_amount", "undo"])
    .describe(
      "log: something was eaten. set_amount: correcting the last log's amount ('actually that was 2', 'make it 150 grams'). " +
        "undo: removing the last log ('undo that', 'remove the last one', 'scratch that').",
    ),
  items: z
    .array(Item)
    .describe("For log: one per food. For set_amount: exactly one, with the new quantity and unit and an empty phrase. For undo: empty."),
  shared: z.boolean().describe("True when it was eaten together and should be split: 'we', 'both of us', 'we split'."),
});

export type Parsed = z.infer<typeof ParseSchema>;

const SYSTEM = `You turn one spoken or typed sentence from a food log into JSON. Two people in Japan use it, \
speaking English with Japanese food words in romaji. Record only what was said. Never convert units, \
never estimate weights, never guess a food that wasn't named. Split "a coffee and 2 onigiri" into two items. \
Units: "grams"/"gram"/"g" → "g"; "kilo" → "kg"; a bag/packet/box → "pack"; a piece/slice/stick of a counted \
snack → "piece".`;

export async function parseSentence(text: string, model?: string): Promise<Parsed> {
  return groqJson({ system: SYSTEM, user: text, schema: ParseSchema, name: "food_log", model });
}
