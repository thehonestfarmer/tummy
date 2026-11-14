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
  who: z
    .enum(["me", "both", "partner", "unstated"])
    .describe(
      "Who ate this item. me: the speaker alone ('I had', 'just had', 'I ate', 'for me'). both: eaten together, " +
        "to be split ('we', 'both of us', 'we split', 'we shared'). partner: the other person alone, by name or " +
        "'she had' / 'he had' / 'for her' / 'for him'. unstated: the sentence doesn't say who ('2 eggs', '400g of shrimp').",
    ),
});

export type Who = z.infer<typeof Item>["who"];

export const ParseSchema = z.strictObject({
  intent: z
    .enum(["log", "set_amount", "undo"])
    .describe(
      "log: something was eaten. set_amount: correcting the last log's amount ('actually that was 2', 'make it 150 grams'). " +
        "undo: removing the last log ('undo that', 'remove the last one', 'scratch that').",
    ),
  items: z
    .array(Item)
    .describe(
      "For log: one per food and person. For set_amount: exactly one, with the new quantity and unit and an empty phrase. For undo: empty.",
    ),
});

export type Parsed = z.infer<typeof ParseSchema>;

const SYSTEM = `You turn one spoken or typed sentence from a food log into JSON. Two people in Japan use it, \
speaking English with Japanese food words in romaji. Record only what was said. Never convert units, \
never estimate weights, never guess a food that wasn't named. Split "a coffee and 2 onigiri" into two items. \
Units: "grams"/"gram"/"g" → "g"; "kilo" → "kg"; a bag/packet/box → "pack"; a piece/slice/stick of a counted \
snack → "piece". Who: a sentence with "I", "my", or an eating verb and no subject ("just had", "had", "ate") \
is "me". Something eaten together is ONE item with who "both": "we split a bag of chips" is chips, 1 pack, \
both. Only when the sentence gives each person their own amount do you make one item per person: "I had two \
yogurts and she had one" is yogurt ×2 for me and yogurt ×1 for partner; "125 of rice for me, 50 for her" is \
rice 125 g for me and rice 50 g for partner. A bare food with no verb and no person ("2 eggs", "400g of \
shrimp") is "unstated".`;

/** `people` names the speaker and their partner, so "Bunny had one" is known to be the partner (§5.7). */
export async function parseSentence(text: string, people?: { speaker: string; partner: string }, model?: string): Promise<Parsed> {
  const system = people ? `${SYSTEM} The speaker is ${people.speaker}; their partner is ${people.partner}.` : SYSTEM;
  return groqJson({ system, user: text, schema: ParseSchema, name: "food_log", model });
}
