import "server-only";
import { after } from "next/server";
import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import { ANCHOR_TZ } from "../config";
import { submitFromChat, confirmFromChat, draftsForChat, type ChatFood } from "./chat";
import { askChoice, closeChoice, openChoice } from "./choices";
import type { Client } from "./client";
import {
  addPendingLog,
  deleteEntry,
  getHealthDay,
  logEntry,
  logShared,
  recentFoods,
  updateEntry,
  type HealthDayView,
} from "./entries";
import { createNamedDraft, FoodPatchSchema, getFood, getLibrary, readDraft, searchFoods, updateFood } from "./foods";
import { getGuidelines, SectionSchema, updateGuideline } from "./guidance";
import { once } from "./once";
import { CorrectionSchema, PrintedSchema, type Printed } from "./printed";
import { learnAlias, quickLog, resolvePending, undoLast, type PendingItem } from "./quicklog";
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
Call get_context first for anything about today. Call get_guidelines before giving any nutrition or \
training advice, and follow it. Never state calories or macros from memory or from earlier in the \
conversation: look them up every time. Log with log_food in the person's own words. When a tool returns \
needs_choice, ask the person and answer with resolve_choice; never guess an amount or a food. Weigh raw \
unless the person says cooked. Training never changes the day's calorie target. Never state a daily \
weight for someone whose weight is trend-only.`;

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

/* ─── Questions back to the person (mcpspec.md §4.4) ─────────────────────── */

type LogItemChoice = PendingItem & { tz: string };
type DuplicateChoice = { printed: Printed; confirmed: boolean; gramsToLog: number | null; tz: string };

function questionFor(p: PendingItem): string {
  switch (p.reason) {
    case "no_match":
      return `Nothing in the library is called "${p.phrase}". Ask what it is, then answer with a food_id from search_foods, or add it with add_food first.`;
    case "ambiguous":
      return `"${p.phrase}" could be more than one food. Ask which, and answer with its food_id.`;
    case "needs_grams":
      return `How much does one ${p.phrase} weigh? Answer with grams_per_piece, which is remembered for next time, or grams for this once.`;
    case "draft":
      return `"${p.candidates[0]?.name ?? p.phrase}" is still a draft. Show its values (search_foods with include_drafts), confirm_food it on yes, then answer with its food_id.`;
  }
}

const requestId = z
  .string()
  .max(100)
  .optional()
  .describe("Optional. Repeating a request id returns the first result instead of writing again.");

export function mcpHandlerFor(user: User, client: Client) {
  const tz = () => zoneFor(user);
  const today = async () => dateIn(await tz());

  /** A write: retried calls with the same arguments within a minute return the first result (§10). */
  const write = (tool: string, args: { request_id?: string }, fn: () => Promise<unknown>) => {
    const { request_id, ...rest } = args;
    return run(() => once(user, tool, rest, request_id, fn));
  };

  async function logAfterAdd(food: ChatFood, grams: number | null, zone: string) {
    if (!grams) return;
    if (food.draft_id) {
      await addPendingLog(user.id, user.id, food.draft_id, { grams, tz: zone, source: "mcp", client });
    } else if (food.food_id) {
      await logEntry(user, user.id, { foodId: food.food_id, grams, source: "mcp", client, tz: zone });
    }
  }

  /** add_food's results, with a question token on anything that may already be in the library. */
  async function withQuestions(results: (ChatFood | { status: "invalid"; name: string; message: string })[], items: Printed[], confirmed: boolean, gramsToLog: number | null, zone: string) {
    return Promise.all(
      results.map(async (r, i) =>
        r.status === "possible_duplicate"
          ? {
              ...r,
              status: "needs_choice",
              token: await askChoice<DuplicateChoice>(user, client, "duplicate", { printed: items[i], confirmed, gramsToLog, tz: zone }),
              question: "Is it one of these? Answer with its food_id if so, or new_food: true if it's different.",
            }
          : r,
      ),
    );
  }

  return createMcpHandler(
    (server) => {
      /* ─── Context and guidance ─────────────────────────────────────────── */

      server.registerTool(
        "get_context",
        {
          title: "Today, in one call",
          description:
            "Call this first for any question about today. The caller's totals, target and what remains, with " +
            "today's entries; the partner's totals; the foods the caller logs most lately; and how many drafts " +
            "are waiting for a yes. All numbers are computed by Tummy.",
          inputSchema: z.object({}),
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        () =>
          run(async () => {
            const day = await getHealthDay(user, await today());
            const [me, partner, recent, { drafts }] = await Promise.all([
              dayOut(day, "me"),
              dayOut(day, "partner"),
              recentFoods(user),
              getLibrary(),
            ]);
            return {
              today: me,
              partner,
              recent_foods: recent.slice(0, 10).map((f) => ({ food_id: f.foodId, name: f.name, last_grams: f.grams })),
              drafts_waiting: drafts,
              before_advice: "Call get_guidelines and follow it.",
            };
          }),
      );

      server.registerTool(
        "get_guidelines",
        {
          title: "House rules for advice",
          description:
            "The person's guidance, with their live targets: standing rules, fasting, safety stops, how weight " +
            "is judged and shown, training notes, and the tone to use. Call this before giving any nutrition or " +
            "training advice, and follow it. who: 'me' (default) or 'partner'.",
          inputSchema: z.object({ who: z.enum(["me", "partner"]).default("me") }),
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        ({ who }) => run(async () => getGuidelines(user, who, await today())),
      );

      server.registerTool(
        "update_guidelines",
        {
          title: "Rewrite one section of the guidance",
          description:
            "Replaces one section of a person's guidance with new text, when the person asks for the change " +
            "(a new program, a new rule). Either person can edit either's. Send the whole new section, not a " +
            "diff. Targets aren't a section: they change through proposals.",
          inputSchema: z.object({
            who: z.enum(["me", "partner"]).default("me"),
            section: SectionSchema,
            text: z.string().min(1).max(4000),
            request_id: requestId,
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) => write("update_guidelines", input, async () => updateGuideline(user, input.who, input.section, input.text)),
      );

      server.registerTool(
        "get_day",
        {
          title: "Get a day's food",
          description:
            "What was eaten on a day, with totals, target and what remains, all computed by Tummy. Use this " +
            "for past days; get_context covers today. Never add up numbers yourself or reuse ones from earlier " +
            "in the chat. who: 'me' (the caller, default) or 'partner' (totals only).",
          inputSchema: z.object({
            date: z.string().optional().describe("YYYY-MM-DD. Defaults to today in the caller's time zone."),
            who: z.enum(["me", "partner"]).default("me"),
          }),
          annotations: { readOnlyHint: true, openWorldHint: false },
        },
        ({ date, who }) =>
          run(async () => dayOut(await getHealthDay(user, isDate(date) ? date : await today()), who)),
      );

      /* ─── The food library ─────────────────────────────────────────────── */

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
            "library comes back as needs_choice: ask, and answer with resolve_choice.",
          inputSchema: z.object({
            foods: z.array(PrintedSchema).max(30).optional(),
            name: z.string().min(1).max(120).optional(),
            confirmed: z.boolean().default(false),
            grams_to_log: z
              .number()
              .positive()
              .max(10_000)
              .optional()
              .describe("With one food: also log this much for the caller, once it is confirmed."),
            request_id: requestId,
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) =>
          write("add_food", input, async () => {
            const zone = await tz();
            const items = input.foods ?? [];
            const grams = input.grams_to_log ?? null;
            if (!items.length && !input.name) throw new Error("Pass foods read off a label, or a name.");
            if (grams && items.length + (input.name ? 1 : 0) !== 1) throw new Error("grams_to_log goes with exactly one food.");

            if (!items.length) {
              const id = await createNamedDraft(user, input.name!, client);
              after(() => readDraft(id));
              if (grams) await addPendingLog(user.id, user.id, id, { grams, tz: zone, source: "mcp", client });
              return {
                results: [{ status: "draft", draft_id: id, name: input.name }],
                message:
                  "Tummy is looking it up. In a few seconds, search_foods with include_drafts shows its values; " +
                  "show them to the person and call confirm_food on yes." +
                  (grams ? ` Then ${grams}g is logged.` : ""),
              };
            }

            const results: (ChatFood | { status: "invalid"; name: string; message: string })[] = [];
            for (const item of items) {
              try {
                results.push(await submitFromChat(user, client, item, { confirmed: input.confirmed, newFood: false }));
              } catch (err) {
                results.push({ status: "invalid", name: item.name, message: err instanceof Error ? err.message : "Couldn't add that." });
              }
            }
            const [only] = results;
            if (grams && only.status !== "invalid" && only.status !== "possible_duplicate") await logAfterAdd(only, grams, zone);
            return {
              results: await withQuestions(results, items, input.confirmed, grams, zone),
              ...(grams ? { today: await dayOut(await getHealthDay(user, dateIn(zone)), "me") } : {}),
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
            request_id: requestId,
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) =>
          write("confirm_food", input, async () => {
            const food = await confirmFromChat(user, client, input.draft_id, input.corrections);
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
            request_id: requestId,
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) =>
          write("update_food", input, async () => {
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
              servings: [...food.servings.filter((s) => !added.has(s.label.toLowerCase())), ...added.values()],
            });
            const updated = await updateFood(food.id, patch);
            return {
              message: `Updated ${updated.name}.`,
              food: { food_id: updated.id, name: updated.name, per_100g: updated.per100, servings: updated.servings, aliases: updated.aliases },
            };
          }),
      );

      /* ─── Logging ──────────────────────────────────────────────────────── */

      server.registerTool(
        "log_food",
        {
          title: "Log food",
          description:
            "The main way to log. Pass `text`: the caller's own words, exactly as they said them ('just had 1 " +
            "shoyu senbei', 'we split a bag of chips', 'usual lunch', 'undo that', 'actually that was 2'). " +
            "Never pass calories or macros: Tummy computes them. Clear matches are logged at once; anything " +
            "uncertain comes back under needs_choice, each with a question and a token. Ask the person, then " +
            "answer with resolve_choice. Quote the result's message.",
          inputSchema: z.object({ text: z.string().min(1).max(500), request_id: requestId }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) =>
          write("log_food", input, async () => {
            const zone = await tz();
            const r = await quickLog(user, input.text, { tz: zone, source: "mcp", client });
            const choices = await Promise.all(
              r.pending.map(async (p) => ({
                token: await askChoice<LogItemChoice>(user, client, "log_item", { ...p, tz: zone }),
                phrase: p.phrase,
                reason: p.reason,
                question: questionFor(p),
                candidates: p.candidates.map((c) => ({ food_id: c.id, name: c.name, name_ja: c.nameJa })),
              })),
            );
            return {
              status: choices.length ? "needs_choice" : "logged",
              message: r.message,
              logged: r.logged.map((l) => ({ entry_id: l.entryId, food: l.name, grams: l.grams, kcal: l.kcal, shared: l.shared })),
              ...(choices.length ? { needs_choice: choices } : {}),
              today: await dayOut(r.day, "me"),
            };
          }),
      );

      server.registerTool(
        "log_food_items",
        {
          title: "Log foods by id",
          description:
            "For when you already have food ids from search_foods: each item with grams, or a serving name and " +
            "a count ('piece', 3). `shared` logs each item for both people, split by `my_share` (half each by " +
            "default). Prefer log_food with the person's words whenever you can.",
          inputSchema: z.object({
            items: z
              .array(
                z.object({
                  food_id: z.number().int(),
                  grams: z.number().positive().max(10_000).optional(),
                  serving: z.string().max(40).optional(),
                  count: z.number().positive().max(100).optional(),
                }),
              )
              .min(1)
              .max(20),
            shared: z.boolean().default(false),
            my_share: z.number().min(0).max(1).default(0.5),
            request_id: requestId,
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) =>
          write("log_food_items", input, async () => {
            const zone = await tz();
            // Work out every amount before writing anything, so one bad item logs nothing.
            const planned = [];
            for (const item of input.items) {
              const food = await getFood(item.food_id);
              if (!food) throw new Error(`No confirmed food has id ${item.food_id}.`);
              let grams = item.grams;
              if (!grams && item.serving) {
                const s = food.servings.find((x) => x.label.toLowerCase() === item.serving!.toLowerCase());
                if (!s) throw new Error(`${food.name} has no "${item.serving}" serving. It has: ${food.servings.map((x) => x.label).join(", ") || "none"}.`);
                grams = s.grams * (item.count ?? 1);
              }
              if (!grams) throw new Error(`How much ${food.name}? Pass grams, or a serving and count.`);
              planned.push({ food, grams });
            }
            const logged = [];
            for (const { food, grams } of planned) {
              const base = { foodId: food.id, source: "mcp" as const, client, tz: zone };
              if (input.shared) {
                const { mine, theirs } = await logShared(user, { ...base, myGrams: grams * input.my_share, partnerGrams: grams * (1 - input.my_share) });
                logged.push({ food: food.name, my_grams: mine?.grams ?? 0, partner_grams: theirs?.grams ?? 0, kcal: mine?.macros.kcal ?? 0 });
              } else {
                const e = await logEntry(user, user.id, { ...base, grams });
                logged.push({ entry_id: e.id, food: e.name, grams: e.grams, kcal: e.macros.kcal });
              }
            }
            return { logged, today: await dayOut(await getHealthDay(user, dateIn(zone)), "me") };
          }),
      );

      server.registerTool(
        "resolve_choice",
        {
          title: "Answer a question a tool asked",
          description:
            "Answers a needs_choice from log_food or add_food, after asking the person. Pass the token and the " +
            "answer: food_id (which food it was), and for an amount grams_per_piece (remembered as the food's " +
            "piece weight) or grams (this time only). For a possible duplicate from add_food: food_id if it's " +
            "that food, or new_food: true if it's different. A token works once and lasts 30 minutes.",
          inputSchema: z.object({
            token: z.string().min(1).max(40),
            food_id: z.number().int().optional(),
            grams: z.number().positive().max(10_000).optional(),
            grams_per_piece: z.number().positive().max(5_000).optional(),
            new_food: z.boolean().optional(),
            request_id: requestId,
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) =>
          write("resolve_choice", input, async () => {
            const asked = await openChoice<LogItemChoice | DuplicateChoice>(user, input.token);

            if (asked.kind === "log_item") {
              const p = asked.payload as LogItemChoice;
              const foodId = input.food_id ?? (p.candidates.length === 1 ? p.candidates[0].id : null);
              if (!foodId) throw new Error("Which food? Pass its food_id.");
              // "An hour ago" meant an hour before it was said, not before it was answered.
              const waited = Math.round((Date.now() - asked.askedAt.getTime()) / 60_000);
              const { entry, day } = await resolvePending(
                user,
                {
                  phrase: p.phrase,
                  foodId,
                  quantity: p.quantity,
                  unit: p.unit,
                  minutesAgo: (p.minutesAgo ?? 0) + waited || null,
                  gramsPerPiece: input.grams_per_piece ?? null,
                  grams: input.grams ?? null,
                  shared: p.shared,
                },
                { tz: p.tz, source: "mcp", client },
              );
              await closeChoice(input.token);
              return {
                message: `Added ${entry.name} · ${entry.macros.kcal} kcal.`,
                logged: [{ entry_id: entry.id, food: entry.name, grams: entry.grams, ...entry.macros }],
                today: await dayOut(day, "me"),
              };
            }

            const d = asked.payload as DuplicateChoice;
            if (input.new_food) {
              const food = await submitFromChat(user, client, d.printed, { confirmed: d.confirmed, newFood: true });
              await logAfterAdd(food, d.gramsToLog, d.tz);
              await closeChoice(input.token);
              return { result: food };
            }
            if (!input.food_id) throw new Error("Is it an existing food (food_id) or a new one (new_food: true)?");
            const existing = await getFood(input.food_id);
            if (!existing) throw new Error("That food isn't in the library.");
            // The name just used for it is worth keeping, for voice.
            await learnAlias(existing.id, d.printed.name);
            if (d.gramsToLog) await logEntry(user, user.id, { foodId: existing.id, grams: d.gramsToLog, source: "mcp", client, tz: d.tz });
            await closeChoice(input.token);
            return {
              message: `It's ${existing.name}, already in the library. Nothing new was added.` + (d.gramsToLog ? ` Logged ${d.gramsToLog}g.` : ""),
              food: { food_id: existing.id, name: existing.name, per_100g: existing.per100, servings: existing.servings },
            };
          }),
      );

      server.registerTool(
        "edit_entry",
        {
          title: "Change a logged entry",
          description:
            "Changes the grams or the date of one of the caller's entries (entry ids come from get_context or " +
            "get_day). The macros follow from the grams. For 'actually that was 2' just after logging, log_food " +
            "with those words works too.",
          inputSchema: z.object({
            entry_id: z.number().int(),
            grams: z.number().positive().max(100_000).optional(),
            date: z.string().optional().describe("YYYY-MM-DD, to move a late-night entry to the day it belongs to."),
            request_id: requestId,
          }),
          annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
        },
        (input) =>
          write("edit_entry", input, async () => {
            if (input.grams === undefined && input.date === undefined) throw new Error("Change the grams, the date, or both.");
            if (input.date !== undefined && !isDate(input.date)) throw new Error("That date doesn't look right.");
            await updateEntry(user, input.entry_id, { grams: input.grams, localDate: input.date });
            return { message: "Changed.", today: await dayOut(await getHealthDay(user, await today()), "me") };
          }),
      );

      server.registerTool(
        "delete_entry",
        {
          title: "Delete a logged entry",
          description:
            "Deletes one of the caller's entries. For a shared meal it deletes only the caller's half, unless " +
            "both: true, which removes the partner's half too. Only when the person asks.",
          inputSchema: z.object({ entry_id: z.number().int(), both: z.boolean().default(false), request_id: requestId }),
          annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
        },
        (input) =>
          write("delete_entry", input, async () => {
            const removed = await deleteEntry(user, input.entry_id, input.both);
            if (!removed.length) throw new Error("That entry isn't one of yours, or it's already gone.");
            return {
              message: removed.length > 1 ? `Removed ${removed[0]} from both days.` : `Removed ${removed[0]}.`,
              today: await dayOut(await getHealthDay(user, await today()), "me"),
            };
          }),
      );

      server.registerTool(
        "undo_last",
        {
          title: "Undo the last log",
          description:
            "Removes the caller's most recent log from the last 10 minutes (every food in it). A second call " +
            "within a minute is treated as a retry and removes nothing more; to remove two logs, use delete_entry.",
          inputSchema: z.object({ request_id: requestId }),
          annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
        },
        (input) =>
          write("undo_last", input, async () => {
            const removed = await undoLast(user);
            return { message: removed.length ? `Removed ${removed.join(", ")}.` : "Nothing recent to remove." };
          }),
      );
    },
    { serverInfo: { name: "tummy", version: "1.0.0" }, instructions: INSTRUCTIONS },
  );
}
