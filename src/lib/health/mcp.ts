import "server-only";
import { after } from "next/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import { ANCHOR_TZ } from "../config";
import { confirmFromChat, draftsForChat, submitFromChat } from "./chat";
import type { Client } from "./client";
import { addPendingLog, getHealthDay, logEntry, type HealthDayView } from "./entries";
import { createNamedDraft, FoodPatchSchema, getFood, readDraft, searchFoods, updateFood } from "./foods";
import { CorrectionSchema, PrintedSchema } from "./printed";
import { quickLog, resolvePending, undoLast } from "./quicklog";
import { lastZoneOf } from "./tokens";
import { dateIn, isDate } from "./zone";

/**
 * Tummy over MCP, for Claude and ChatGPT (mcpspec.md). The app owns every
 * fact and every number; the assistant is a client with no memory of its own.
 * The rules are enforced by what the tools accept, not by asking:
 *
 *   1. No tool that logs accepts macros. `log_food` takes words, or a food
 *      id and grams, and the server does the arithmetic.
 *   2. A label comes in as printed and the server converts it. It is saved
 *      as confirmed only when the person has seen exactly the values being
 *      saved; anything the server changed or warned about goes back to be
 *      shown first (see chat.ts).
 *   3. No match is said plainly, with candidates, never filled with a guess.
 *   4. Every write echoes what was stored, and the caller's day.
 *   5. Reads return finished totals, and every food says where its numbers
 *      came from.
 *
 * Each person's connector URL carries their own secret, so the server knows
 * who is calling and no tool takes a user argument. ChatGPT's link adds
 * /chatgpt, so every write records which assistant made it.
 *
 * The claude.ai app shows the model tool descriptions and results but not
 * server instructions, so the rules that matter are in the descriptions.
 */

const INSTRUCTIONS = `Tummy is a private food log for two people, Bunny and Bear. It holds the \
only trustworthy nutrition numbers: a library of foods confirmed from labels and a Japanese food table. \
Never state calories or macros from memory or from earlier in the conversation: look them up with \
get_day or search_foods every time. Log with log_food in the person's own words. If a tool says an \
item needs a word, ask the person; never guess an amount or a food. Weigh raw unless the person says \
cooked. Training never changes the day's calorie target.`;

const ok = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value, null, 1) }] });
const fail = (message: string) => ({ isError: true, content: [{ type: "text" as const, text: message }] });

async function run(fn: () => Promise<unknown>) {
  try {
    return ok(await fn());
  } catch (err) {
    // Domain errors are worded for people; hand them back for the model to relay.
    return fail(err instanceof Error ? err.message : "That didn't work.");
  }
}

/** The day as an assistant should read it: finished numbers, and what's left. */
async function dayOut(day: HealthDayView, who: "me" | "partner") {
  const side = who === "me" ? day.me : day.partner;
  const remaining = side.target
    ? {
        kcal: side.target.kcal - side.totals.kcal,
        protein_g: Math.round((side.target.protein_g - side.totals.protein_g) * 10) / 10,
        fat_g: Math.round((side.target.fat_g - side.totals.fat_g) * 10) / 10,
        carbs_g: Math.round((side.target.carbs_g - side.totals.carbs_g) * 10) / 10,
      }
    : null;
  return {
    date: day.date,
    person: side.displayName,
    totals: side.totals,
    target: side.target,
    remaining,
    ...(who === "me"
      ? {
          entries: await withSources(
            day.me.entries.map((e) => ({
              entry_id: e.id,
              food_id: e.foodId,
              time: e.clock,
              food: e.name,
              grams: e.grams,
              ...e.macros,
              ...(e.addedBy ? { added_by: e.addedBy } : {}),
              ...(e.sharedMealId ? { shared: true } : {}),
            })),
          ),
        }
      : {}),
  };
}

const SOURCE_WORDS: Record<string, string> = {
  label_ocr: "read from its label, confirmed by a person",
  pack_read: "meat or fish pack, values from the food table or an estimate",
  reference_table: "Japanese food composition table (MEXT)",
  llm_estimate: "a model's estimate, confirmed by a person",
  manual: "typed in by a person",
};

/** Principle 8: every food says where its numbers came from. */
async function withSources<T extends { food_id: number | null }>(rows: T[]) {
  const ids = [...new Set(rows.map((r) => r.food_id).filter((id): id is number => id !== null))];
  const sources = ids.length
    ? await sql<{ id: number; source: string | null }[]>`select id, source from foods where id = any(${ids})`
    : [];
  const by = new Map(sources.map((s) => [s.id, s.source]));
  return rows.map((r) => ({ ...r, numbers_from: SOURCE_WORDS[by.get(r.food_id ?? -1) ?? ""] ?? "unknown" }));
}

async function zoneFor(user: User): Promise<string> {
  return (await lastZoneOf(user.id)) ?? ANCHOR_TZ;
}

export function mcpHandlerFor(user: User, client: Client) {
  return createMcpHandler(
    (server) => {
      server.registerTool(
        "get_day",
        {
          title: "Get a day's food",
          description:
            "What was eaten on a day, with totals, target and what remains, all computed by Tummy. Use this " +
            "for any question about intake; never add up numbers yourself or reuse ones from earlier in the chat. " +
            "who: 'me' (the caller, default) or 'partner' (totals only).",
          inputSchema: z.object({
            date: z.string().optional().describe("YYYY-MM-DD. Defaults to today in the caller's time zone."),
            who: z.enum(["me", "partner"]).default("me"),
          }),
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        ({ date, who }) =>
          run(async () => {
            const tz = await zoneFor(user);
            return dayOut(await getHealthDay(user, isDate(date) ? date : dateIn(tz)), who);
          }),
      );

      server.registerTool(
        "log_food",
        {
          title: "Log food",
          description:
            "Log what the caller ate. Pass `text` in their own words ('just had 1 shoyu senbei', 'we split a " +
            "bag of chips', 'usual lunch', 'undo that', 'actually that was 2'), exactly as they said it. Or, to " +
            "answer a question this tool asked, pass `food_id` with `grams` (or `count` and `grams_per_piece`). " +
            "Never pass calories or macros: Tummy computes them. The result lists what was logged, and any " +
            "item that `needs_word`: no_match (not in the library: offer add_food), ambiguous (ask which of the " +
            "candidates), needs_grams (ask how much one weighs or how many grams), draft (waiting for someone to " +
            "confirm it: see confirm_food). Quote the result's message to the person.",
          inputSchema: z.object({
            text: z.string().max(500).optional(),
            food_id: z.number().int().optional(),
            grams: z.number().positive().max(10_000).optional(),
            count: z.number().positive().max(100).optional(),
            grams_per_piece: z
              .number()
              .positive()
              .max(5_000)
              .optional()
              .describe("What one piece weighs, if the person said so. It is remembered for next time."),
            shared: z.boolean().default(false).describe("Eaten together: logged for both people, half each."),
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) =>
          run(async () => {
            const tz = await zoneFor(user);
            const ctx = { tz, source: "mcp" as const, client };
            if (input.text) {
              const r = await quickLog(user, input.text, ctx);
              return {
                message: r.message,
                logged: r.logged.map((l) => ({ entry_id: l.entryId, food: l.name, grams: l.grams, kcal: l.kcal, shared: l.shared })),
                needs_word: r.pending.map((p) => ({
                  phrase: p.phrase,
                  said: { quantity: p.quantity, unit: p.unit },
                  reason: p.reason,
                  candidates: p.candidates.map((c) => ({ food_id: c.id, name: c.name, name_ja: c.nameJa })),
                })),
                today: await dayOut(r.day, "me"),
              };
            }
            if (!input.food_id) throw new Error("Pass the person's words as text, or a food_id with grams.");
            const { entry, day } = await resolvePending(
              user,
              {
                phrase: "",
                foodId: input.food_id,
                quantity: input.count ?? null,
                unit: input.count ? "piece" : null,
                minutesAgo: null,
                gramsPerPiece: input.grams_per_piece ?? null,
                grams: input.grams ?? null,
                shared: input.shared,
              },
              ctx,
            );
            return {
              message: `Added ${entry.name} · ${entry.macros.kcal} kcal.`,
              logged: [{ entry_id: entry.id, food: entry.name, grams: entry.grams, ...entry.macros }],
              today: await dayOut(day, "me"),
            };
          }),
      );

      server.registerTool(
        "undo_last",
        {
          title: "Undo the last log",
          description: "Removes the caller's most recent log from the last 10 minutes (every food in it).",
          inputSchema: z.object({}),
          annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
        },
        () =>
          run(async () => {
            const removed = await undoLast(user);
            return { message: removed.length ? `Removed ${removed.join(", ")}.` : "Nothing recent to remove." };
          }),
      );

      server.registerTool(
        "search_foods",
        {
          title: "Search the food library",
          description:
            "Confirmed foods whose name, Japanese name or alias contains the query, with per-100g values, " +
            "servings, and where the numbers came from. Search before adding a food or estimating anything: " +
            "never estimate macros for a food that's already here. With include_drafts, also lists drafts " +
            "waiting for a yes, from the app's Review screen or from a chat.",
          inputSchema: z.object({
            query: z.string().max(100).default(""),
            include_drafts: z.boolean().default(false),
          }),
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        ({ query, include_drafts }) =>
          run(async () => {
            const foods = await withSources(
              (await searchFoods(query)).slice(0, 25).map((f) => ({
                food_id: f.id,
                name: f.name,
                name_ja: f.nameJa,
                per_100g: f.per100,
                servings: f.servings,
                ...(f.reference ? { table_row: f.reference.name } : {}),
              })),
            );
            return include_drafts ? { foods, drafts: await draftsForChat() } : foods;
          }),
      );

      server.registerTool(
        "add_food",
        {
          title: "Add foods to the library",
          description:
            "Adds foods that aren't in the library yet (search_foods first). Two ways:\n" +
            "- `foods`: what you read off packaging the person showed you, one item per product. Copy the " +
            "label exactly as printed, for the basis printed (per 100g, per bag, per piece...). Don't convert " +
            "to per 100g and don't add servings up: Tummy does that. For a pack with no nutrition panel (meat, " +
            "fish) or loose produce, use kind 'estimate' with per-100g raw values and Tummy takes them from the " +
            "Japanese food table where it can.\n" +
            "- `name` alone ('squid, raw'): Tummy looks the food up and makes a draft.\n" +
            "Set `confirmed: true` only if the person has seen the values in this conversation and said yes; " +
            "for a batch, one yes for the whole set is fine. Even then, an item comes back as a draft when Tummy " +
            "has something new to show: warnings, or values it took from the food table. Show those to the " +
            "person, every warning included, and call confirm_food on yes. An item that may already be in the " +
            "library comes back as possible_duplicate: ask, and use new_food: true only if it's different.",
          inputSchema: z.object({
            foods: z.array(PrintedSchema).max(30).optional(),
            name: z.string().min(1).max(120).optional(),
            confirmed: z.boolean().default(false),
            new_food: z.boolean().default(false).describe("Skip the check for a likely existing match."),
            grams_to_log: z
              .number()
              .positive()
              .max(10_000)
              .optional()
              .describe("With one food: also log this much for the caller, once it is confirmed."),
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) =>
          run(async () => {
            const tz = await zoneFor(user);
            const items = input.foods ?? [];
            if (!items.length && !input.name) throw new Error("Pass foods read off a label, or a name.");
            if (input.grams_to_log && items.length + (input.name ? 1 : 0) !== 1) {
              throw new Error("grams_to_log goes with exactly one food.");
            }

            if (!items.length) {
              const id = await createNamedDraft(user, input.name!, client);
              after(() => readDraft(id));
              if (input.grams_to_log) {
                await addPendingLog(user.id, user.id, id, { grams: input.grams_to_log, tz, source: "mcp", client });
              }
              return {
                results: [{ status: "draft", draft_id: id, name: input.name }],
                message:
                  "Tummy is looking it up. In a few seconds, search_foods with include_drafts shows its values; " +
                  "show them to the person and call confirm_food on yes." +
                  (input.grams_to_log ? ` Then ${input.grams_to_log}g is logged.` : ""),
              };
            }

            const results = [];
            for (const item of items) {
              try {
                results.push(await submitFromChat(user, client, item, { confirmed: input.confirmed, newFood: input.new_food }));
              } catch (err) {
                results.push({ status: "invalid", name: item.name, message: err instanceof Error ? err.message : "Couldn't add that." });
              }
            }
            const [only] = results;
            if (input.grams_to_log && "draft_id" in only && only.draft_id) {
              await addPendingLog(user.id, user.id, only.draft_id, { grams: input.grams_to_log, tz, source: "mcp", client });
            } else if (input.grams_to_log && "food_id" in only && only.food_id) {
              await logEntry(user, user.id, { foodId: only.food_id, grams: input.grams_to_log, source: "mcp", client, tz });
            }
            return {
              results,
              ...(input.grams_to_log ? { today: await dayOut(await getHealthDay(user, dateIn(tz)), "me") } : {}),
            };
          }),
      );

      server.registerTool(
        "confirm_food",
        {
          title: "Confirm a draft food",
          description:
            "Saves a draft as confirmed, after the person has seen its values (and any warnings) and said yes. " +
            "Works on drafts from a chat or from photos taken in the app. Pass `corrections` for anything the " +
            "person changed, using the label's printed fields; on a pack or named food the macros are per 100g.",
          inputSchema: z.object({
            draft_id: z.number().int(),
            corrections: CorrectionSchema.default({}),
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        ({ draft_id, corrections }) =>
          run(async () => {
            const food = await confirmFromChat(user, client, draft_id, corrections);
            return {
              message: `Saved ${food.name} to the library.`,
              food: { food_id: food.id, name: food.name, per_100g: food.per100, servings: food.servings },
            };
          }),
      );

      server.registerTool(
        "update_food",
        {
          title: "Edit a food",
          description:
            "Edits a confirmed food: its names, aliases, servings ('1 piece = 9g'), default amount, or per-100g " +
            "values. Only when the person asks for the change. Past logs keep the values they were logged with.",
          inputSchema: z.object({
            food_id: z.number().int(),
            name: z.string().min(1).max(120).optional(),
            name_ja: z.string().max(120).nullable().optional(),
            brand: z.string().max(120).nullable().optional(),
            add_aliases: z.array(z.string().min(1).max(120)).max(10).optional(),
            add_servings: z
              .array(z.object({ label: z.string().min(1).max(40), grams: z.number().positive().max(100_000) }))
              .max(6)
              .optional()
              .describe("A serving with an existing label replaces it."),
            default_grams: z.number().positive().max(100_000).nullable().optional(),
            per_100g: z
              .object({
                kcal: z.number().min(0).max(1000),
                protein_g: z.number().min(0).max(100),
                fat_g: z.number().min(0).max(100),
                carbs_g: z.number().min(0).max(100),
              })
              .optional(),
            weight_basis: z.enum(["raw", "cooked", "as_packaged"]).optional(),
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) =>
          run(async () => {
            const food = await getFood(input.food_id);
            if (!food) throw new Error("That food isn't in the library.");
            const added = new Map((input.add_servings ?? []).map((s) => [s.label.toLowerCase(), s]));
            const patch = FoodPatchSchema.parse({
              name: input.name ?? food.name,
              name_ja: input.name_ja === undefined ? food.nameJa : input.name_ja,
              brand: input.brand === undefined ? food.brand : input.brand,
              aliases: [...new Set([...food.aliases, ...(input.add_aliases ?? [])])],
              weight_basis: input.weight_basis ?? food.weightBasis,
              ...(input.per_100g ?? food.per100),
              default_grams: input.default_grams === undefined ? food.defaultGrams : input.default_grams,
              servings: [
                ...food.servings.filter((s) => !added.has(s.label.toLowerCase())),
                ...added.values(),
              ],
            });
            const updated = await updateFood(food.id, patch);
            return {
              message: `Updated ${updated.name}.`,
              food: { food_id: updated.id, name: updated.name, per_100g: updated.per100, servings: updated.servings, aliases: updated.aliases },
            };
          }),
      );
    },
    { serverInfo: { name: "tummy", version: "1.0.0" }, instructions: INSTRUCTIONS },
  );
}
