import "server-only";
import { after } from "next/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import { ANCHOR_TZ } from "../config";
import { addPendingLog, getHealthDay, type HealthDayView } from "./entries";
import { createAssistantDraft, createNamedDraft, readDraft, searchFoods } from "./foods";
import { quickLog, resolvePending, undoLast } from "./quicklog";
import { lastZoneOf } from "./tokens";
import { dateIn, isDate } from "./zone";

/**
 * Tummy over MCP, for Claude (healthspec.md §10). The app owns every fact
 * and every number; the assistant is a client with no memory of its own
 * (§10.1). The rules are enforced by what the tools accept, not by asking:
 *
 *   1. No tool that logs accepts macros. `log_food` takes words, or a food
 *      id and grams, and the server does the arithmetic.
 *   2. Values from an assistant only make a draft, which a person confirms
 *      in the app before it counts.
 *   3. No match is said plainly, with candidates, never filled with a guess.
 *   4. Every write echoes what was stored.
 *   5. Reads return finished totals, and every food says where its numbers
 *      came from.
 *
 * Each person's connector URL carries their own secret, so the server knows
 * who is calling and no tool takes a user argument.
 *
 * The claude.ai app shows the model tool descriptions and results but not
 * server instructions, so the rules that matter are in the descriptions.
 */

const INSTRUCTIONS = `Tummy is a private food log for two people, Bunny and Bear. It holds the \
only trustworthy nutrition numbers: a library of foods confirmed from labels and a reference table. \
Never state calories or macros from memory or from earlier in the conversation: look them up with \
get_day or search_foods every time. Log with log_food in the person's own words. If a tool says an \
item needs a word, ask the person; never guess an amount or a food.`;

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
  label_ocr: "read from its label",
  pack_read: "meat or fish pack, values from the food table or an estimate",
  reference_table: "Japanese food composition table (MEXT)",
  llm_estimate: "a model's estimate, confirmed by a person",
  manual: "typed in by a person",
  mcp: "given by an assistant, confirmed by a person",
};

/** Rule 5: every food says where its numbers came from. */
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

export function mcpHandlerFor(user: User) {
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
            "candidates), needs_grams (ask how much one weighs or how many grams), draft (it's waiting for review " +
            "in the app). Quote the result's message to the person.",
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
            if (input.text) {
              const r = await quickLog(user, input.text, { tz, source: "mcp" });
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
              { tz, source: "mcp" },
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
            "servings, and where the numbers came from. Use this instead of recalling nutrition values.",
          inputSchema: z.object({ query: z.string().max(100).default("") }),
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        ({ query }) =>
          run(async () =>
            withSources(
              (await searchFoods(query)).slice(0, 25).map((f) => ({
                food_id: f.id,
                name: f.name,
                name_ja: f.nameJa,
                per_100g: f.per100,
                servings: f.servings,
                ...(f.reference ? { table_row: f.reference.name } : {}),
              })),
            ),
          ),
      );

      server.registerTool(
        "add_food",
        {
          title: "Add a food for review",
          description:
            "Adds a food that isn't in the library yet. It becomes a draft in the app's Review screen and is " +
            "not counted until a person confirms it there. With only `name` (say it with its form: 'squid, " +
            "raw'), Tummy takes the values from the Japanese food composition table. Pass `per_100g` only " +
            "when copying numbers printed on a label the person showed you, converted to per 100g. With " +
            "`grams_to_log`, that amount is logged for the caller once the draft is confirmed.",
          inputSchema: z.object({
            name: z.string().min(1).max(120),
            name_ja: z.string().max(120).optional(),
            per_100g: z
              .object({
                kcal: z.number().min(0).max(1000),
                protein_g: z.number().min(0).max(100),
                fat_g: z.number().min(0).max(100),
                carbs_g: z.number().min(0).max(100),
              })
              .optional(),
            grams_to_log: z.number().positive().max(10_000).optional(),
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) =>
          run(async () => {
            const id = input.per_100g
              ? await createAssistantDraft(user, { name: input.name, nameJa: input.name_ja, per100: input.per_100g })
              : await createNamedDraft(user, input.name);
            if (!input.per_100g) after(() => readDraft(id));
            if (input.grams_to_log) {
              await addPendingLog(user.id, user.id, id, { grams: input.grams_to_log, tz: await zoneFor(user), source: "mcp" });
            }
            return {
              draft_id: id,
              message:
                `Added ${input.name} to Review. It isn't counted until someone confirms it in the app` +
                (input.grams_to_log ? `; then ${input.grams_to_log}g is logged.` : "."),
            };
          }),
      );
    },
    { serverInfo: { name: "tummy", version: "1.0.0" }, instructions: INSTRUCTIONS },
  );
}
