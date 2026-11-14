import "server-only";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import { fold } from "./fold";
import { groqJson } from "./groq";
import { parseSentence, type Parsed, type Who } from "./parse";
import type { Client } from "./client";
import { getHealthDay, logEntry, logShared, macrosFor, partnerOf, type EntrySource, type HealthDayView } from "./entries";
import { listMeals } from "./meals";
import { dateIn } from "./zone";

/**
 * Quick log (healthspec.md §5.5): one sentence in, entries out. The same
 * function serves the mic, typed sentences, and Claude or ChatGPT
 * over MCP, so "just had 1 shoyu senbei" behaves the same wherever it's said.
 *
 *   1. Parse (Groq): what was said, as items. No grams, no food choices.
 *   2. Match each phrase to a confirmed food, deterministically first, by
 *      name and alias in either language, ranked by how often and how
 *      recently this person logs it.
 *   3. Only when that is ambiguous, let the model choose among the top few.
 *   4. Resolve the amount from the food's own servings.
 *
 * Anything that resolves cleanly is logged at once (the caller offers undo).
 * Anything that doesn't comes back as a question about that item alone.
 */

/** How far back "undo that" and "actually that was 2" reach. */
const CORRECTION_WINDOW_MIN = 10;

type LibraryFood = {
  id: number;
  name: string;
  name_ja: string | null;
  aliases: string[];
  status: "draft" | "confirmed";
  default_grams: number | null;
  uses: number;
  last_used: Date | null;
  servings: { label: string; grams: number }[];
};

export type Candidate = { id: number; name: string; nameJa: string | null };

export type PendingReason =
  /** Nothing in the library is called that. */
  | "no_match"
  /** Several foods could be it. */
  | "ambiguous"
  /** A count of something with no piece weight yet: "1 senbei" before anyone has said what one weighs. */
  | "needs_grams"
  /** The food exists but is still waiting for review. */
  | "draft"
  /** What and how much are settled, but the sentence didn't say who ate it: split, or only the speaker (§5.7). */
  | "who";

export type PendingItem = {
  phrase: string;
  quantity: number | null;
  unit: string | null;
  minutesAgo: number | null;
  reason: PendingReason;
  /** Best first. For needs_grams, the one food it is. */
  candidates: Candidate[];
  /** "We split…": the answer is logged for both of you, half each. */
  shared: boolean;
  /** Who the sentence said ate it. */
  who: Who;
  /** For `who`: the amount already worked out, waiting only on whose day it goes in. */
  grams?: number | null;
};

export type LoggedItem = {
  entryId: number;
  name: string;
  grams: number;
  kcal: number;
  /** Also logged into the partner's day (§5.7). */
  shared: boolean;
  /** Set when it went into the partner's day alone: their name. */
  forPartner?: string;
};

export type QuickResult = {
  text: string;
  intent: Parsed["intent"];
  logged: LoggedItem[];
  pending: PendingItem[];
  /** One line saying what happened, for a toast or an assistant to quote. */
  message: string;
  day: HealthDayView;
};

export type QuickContext = { tz: string; source: EntrySource; client?: Client; now?: Date };

/* ─── The library, as matching sees it ───────────────────────────────────── */

async function loadLibrary(userId: number): Promise<LibraryFood[]> {
  return sql<LibraryFood[]>`
    select f.id, f.name, f.name_ja, f.aliases, f.status, f.default_grams,
           coalesce(u.uses, 0)::int as uses, u.last_used,
           coalesce((select json_agg(json_build_object('label', s.label, 'grams', s.grams))
                     from food_servings s where s.food_id = f.id), '[]'::json) as servings
    from foods f
    left join (
      select food_id, count(*) as uses, max(logged_at) as last_used
      from food_entries
      where user_id = ${userId} and logged_at > now() - interval '60 days'
      group by food_id
    ) u on u.food_id = f.id
    where f.name is not null or f.status = 'draft'`;
}

/**
 * The words most likely to be said, for Whisper's prompt: the foods this
 * person logs most, by name and by every alias.
 */
export async function vocabularyFor(userId: number): Promise<string[]> {
  const foods = (await loadLibrary(userId)).filter((f) => f.status === "confirmed");
  foods.sort((a, b) => b.uses - a.uses);
  const words: string[] = [];
  for (const f of foods.slice(0, 40)) {
    for (const w of [f.name, ...f.aliases]) if (/^[\x20-\x7e]+$/.test(w) && !words.includes(w)) words.push(w);
  }
  return words.slice(0, 80);
}

const variants = (f: LibraryFood) => [f.name, f.name_ja, ...f.aliases].map(fold).filter((k) => k.length > 0);

/** "eggs" should find "egg", and "potatoes" "potato". */
function keysFor(phrase: string): string[] {
  const k = fold(phrase);
  const out = [k];
  if (k.endsWith("es") && k.length > 4) out.push(k.slice(0, -2));
  if (k.endsWith("s") && k.length > 3) out.push(k.slice(0, -1));
  return out;
}

const byUse = (a: LibraryFood, b: LibraryFood) =>
  b.uses - a.uses || (b.last_used?.getTime() ?? 0) - (a.last_used?.getTime() ?? 0) || a.name.length - b.name.length;

type Match = { food: LibraryFood; how: "exact" | "chosen" } | { candidates: LibraryFood[] };

function deterministicMatch(phrase: string, library: LibraryFood[]): Match {
  const keys = keysFor(phrase);
  const exact = library.filter((f) => variants(f).some((v) => keys.includes(v)));
  if (exact.length === 1) return { food: exact[0], how: "exact" };
  if (exact.length > 1) return { candidates: exact.sort(byUse) };
  const k = keys[0];
  // "calbee chips" for "Calbee usushio chips": every word said is somewhere in the name.
  const words = phrase.split(/\s+/).flatMap((w) => keysFor(w).slice(-1)).filter((w) => w.length >= 2);
  const near = library.filter((f) =>
    variants(f).some(
      (v) =>
        (v.length >= 2 && k.includes(v)) ||
        (k.length >= 2 && v.includes(k)) ||
        (words.length > 1 && words.every((w) => v.includes(w))),
    ),
  );
  return { candidates: near.sort(byUse).slice(0, 8) };
}

// 0 for "none" rather than null: a bare integer is the shape the parse model
// reliably fills; a nullable one sometimes came back empty.
const ChoiceSchema = z.strictObject({
  choice: z.number().int().describe("The number of the food that was meant, or 0 if none of them is clearly it."),
});

/**
 * Step 3: the model chooses among a handful, never from the whole library.
 * If it fails, the item is simply asked about, the same as a genuine tie.
 */
async function tieBreak(phrase: string, candidates: LibraryFood[]): Promise<LibraryFood | null> {
  try {
    const { choice } = await groqJson({
      name: "food_choice",
      schema: ChoiceSchema,
      system:
        "Someone logging food said a phrase, possibly shortened, plural, or partly misheard by speech " +
        "recognition. Pick which of the numbered foods from their library they meant. Brand or flavour words " +
        "missing from the phrase are fine. Answer 0 only if none of them is the same kind of food, or if two " +
        "are equally likely.",
      user:
        `Phrase: ${phrase}\n\nFoods:\n` +
        candidates.map((c, i) => `${i + 1}. ${c.name}${c.name_ja ? ` (${c.name_ja})` : ""}`).join("\n"),
    });
    return choice >= 1 && choice <= candidates.length ? candidates[choice - 1] : null;
  } catch {
    return null;
  }
}

/** The library learns (§5.5): a phrase that took a choice to resolve becomes an alias. */
export async function learnAlias(foodId: number, phrase: string) {
  const key = fold(phrase);
  if (!key) return;
  const [food] = await sql<{ name: string; name_ja: string | null; aliases: string[] }[]>`
    select name, name_ja, aliases from foods where id = ${foodId}`;
  if (!food || [food.name, food.name_ja, ...food.aliases].some((v) => fold(v) === key)) return;
  await sql`update foods set aliases = array_append(aliases, ${phrase.trim()}), updated_at = now() where id = ${foodId}`;
}

/* ─── Amounts ────────────────────────────────────────────────────────────── */

const GRAM_UNITS = new Set(["g", "gram", "grams", "ml"]);
const PACK_UNITS = new Set(["pack", "bag", "box", "packet", "carton", "bottle", "can", "tub", "袋"]);
const PIECE_UNITS = new Set(["piece", "pc", "slice", "stick", "ball", "bar", "sheet", "枚", "個", "本"]);

type Amount = { grams: number } | { needsGrams: true };

/** Grams from what was said and the food's own servings. Never a guess beyond the food's default. */
export function resolveAmount(
  food: Pick<LibraryFood, "default_grams" | "servings">,
  quantity: number | null,
  unit: string | null,
): Amount {
  const u = unit?.trim().toLowerCase() ?? null;
  const serving = (label: string) => food.servings.find((s) => s.label.toLowerCase() === label)?.grams ?? null;
  const q = quantity ?? 1;

  if (u && GRAM_UNITS.has(u) && quantity) return { grams: quantity };
  if (u === "kg" && quantity) return { grams: quantity * 1000 };
  if (u && serving(u)) return { grams: q * serving(u)! };
  if (u && PACK_UNITS.has(u)) {
    const pack = serving("pack");
    return pack ? { grams: q * pack } : { needsGrams: true };
  }
  // A bare count or a piece word is a count of pieces. A single-serve pack
  // (a yogurt cup, one umaibo) counts as a piece: its default amount is the
  // whole pack, so "an oikos" means one of them.
  if ((u === null && quantity !== null) || (u && PIECE_UNITS.has(u))) {
    const pack = serving("pack");
    const piece = serving("piece") ?? (pack && food.default_grams === pack ? pack : null);
    if (piece) return { grams: q * piece };
    // "125 of rice": with nothing to count in, a number that size was a weight.
    if (u === null && quantity !== null && quantity >= 20) return { grams: quantity };
    return { needsGrams: true };
  }
  // A vague amount ("a bowl", "some") uses the food's own default (§5.5).
  return { grams: q * (food.default_grams ?? 100) };
}

/* ─── The pipeline ───────────────────────────────────────────────────────── */

const summarise = (logged: LoggedItem[]) =>
  logged.map((l) => `${l.name} · ${l.kcal} kcal${l.shared ? " each" : l.forPartner ? ` for ${l.forPartner}` : ""}`).join(", ");

const cand = (f: LibraryFood): Candidate => ({ id: f.id, name: f.name, nameJa: f.name_ja });

export async function quickLog(me: User, text: string, ctx: QuickContext): Promise<QuickResult> {
  const sentence = text.trim();
  if (!sentence) throw new Error("Say what you ate.");
  if (sentence.length > 500) throw new Error("That's a lot at once. Try one meal at a time.");
  const now = ctx.now ?? new Date();
  const partner = await partnerOf(me);
  const parsed = await parseSentence(sentence, { speaker: me.displayName, partner: partner.displayName });
  const day = () => getHealthDay(me, dateIn(ctx.tz, now));

  if (parsed.intent === "undo") {
    const removed = await undoLast(me);
    return {
      text: sentence,
      intent: "undo",
      logged: [],
      pending: [],
      message: removed.length ? `Removed ${removed.join(", ")}.` : "Nothing recent to remove.",
      day: await day(),
    };
  }

  if (parsed.intent === "set_amount") {
    const item = parsed.items[0];
    const changed = item ? await setLastAmount(me, item.quantity, item.unit) : null;
    return {
      text: sentence,
      intent: "set_amount",
      logged: [],
      pending: [],
      message: changed ? `Changed ${changed.name} to ${Math.round(changed.grams)}g · ${changed.kcal} kcal.` : "Nothing recent to change.",
      day: await day(),
    };
  }

  const [library, meals] = await Promise.all([loadLibrary(me.id), listMeals()]);
  const logged: LoggedItem[] = [];
  const pending: PendingItem[] = [];
  // "Just had a senbei" names nobody, but nobody says it about someone else. The
  // parse model doesn't reliably see that, so the sentence itself settles it:
  // only a bare food ("2 eggs") is left to be asked about.
  const spokenAsMe = /\b(i|i'm|i've|i'll|my|me|just|had|have|having|ate|eaten|eating|drank|finished)\b/i.test(sentence);
  for (const item of parsed.items) if (item.who === "unstated" && spokenAsMe) item.who = "me";
  /**
   * `halve`: "we split a bag" puts half the amount in each day. `both`: a
   * shared saved meal puts its per-person amounts in each day. `partner`:
   * "Bunny had one" goes into the partner's day alone.
   */
  const toLog: { foodId: number; grams: number; at: Date; split: "none" | "halve" | "both" | "partner" }[] = [];

  for (const item of parsed.items) {
    const at = item.minutes_ago ? new Date(now.getTime() - item.minutes_ago * 60_000) : now;
    const base = {
      phrase: item.phrase,
      quantity: item.quantity,
      unit: item.unit,
      minutesAgo: item.minutes_ago,
      shared: item.who === "both",
      who: item.who,
    };

    // A saved meal said by name logs the whole meal: "usual lunch".
    const meal = meals.find((m) => keysFor(item.phrase).includes(fold(m.name)));
    if (meal) {
      const times = item.quantity ?? 1;
      for (const i of meal.items) {
        toLog.push({ foodId: i.foodId, grams: i.grams * times, at, split: meal.shared || item.who === "both" ? "both" : "none" });
      }
      continue;
    }

    let match = deterministicMatch(item.phrase, library);
    if ("candidates" in match) {
      const chosen = match.candidates.length ? await tieBreak(item.phrase, match.candidates) : null;
      if (chosen) match = { food: chosen, how: "chosen" };
      else {
        pending.push({
          ...base,
          reason: match.candidates.length ? "ambiguous" : "no_match",
          candidates: match.candidates.filter((f) => f.status === "confirmed").map(cand),
        });
        continue;
      }
    }

    const food = match.food;
    if (food.status === "draft") {
      pending.push({ ...base, reason: "draft", candidates: [cand(food)] });
      continue;
    }
    const amount = resolveAmount(food, item.quantity, item.unit);
    if ("needsGrams" in amount) {
      pending.push({ ...base, reason: "needs_grams", candidates: [cand(food)] });
      continue;
    }
    if (match.how === "chosen") await learnAlias(food.id, item.phrase);
    // Nobody named: not guessed either way. One question, split or only me, and it's logged on the answer.
    if (item.who === "unstated") {
      pending.push({ ...base, reason: "who", candidates: [cand(food)], grams: amount.grams });
      continue;
    }
    toLog.push({
      foodId: food.id,
      grams: amount.grams,
      at,
      split: item.who === "both" ? "halve" : item.who === "partner" ? "partner" : "none",
    });
  }

  // One transaction, so a sentence's entries share a creation time and
  // "undo that" removes them together.
  await sql.begin(async (tx) => {
    for (const l of toLog) {
      const base = { foodId: l.foodId, source: ctx.source, client: ctx.client, tz: ctx.tz, loggedAt: l.at, inputText: sentence };
      if (l.split === "none") {
        const entry = await logEntry(me, me.id, { ...base, grams: l.grams }, tx);
        logged.push({ entryId: entry.id, name: entry.name, grams: entry.grams, kcal: entry.macros.kcal, shared: false });
      } else if (l.split === "partner") {
        const { theirs } = await logShared(me, { ...base, myGrams: 0, partnerGrams: l.grams }, tx);
        if (theirs) {
          logged.push({
            entryId: theirs.id,
            name: theirs.name,
            grams: theirs.grams,
            kcal: theirs.macros.kcal,
            shared: false,
            forPartner: partner.displayName,
          });
        }
      } else {
        const each = l.split === "halve" ? l.grams / 2 : l.grams;
        const { mine } = await logShared(me, { ...base, myGrams: each, partnerGrams: each }, tx);
        if (mine) logged.push({ entryId: mine.id, name: mine.name, grams: mine.grams, kcal: mine.macros.kcal, shared: true });
      }
    }
  });

  const message = logged.length
    ? `Added ${summarise(logged)}.${pending.length ? " One more needs a word." : ""}`
    : pending.length
      ? "Needs a word before it's logged."
      : "Didn't catch a food in that.";

  return { text: sentence, intent: "log", logged, pending, message, day: await day() };
}

/* ─── Corrections ────────────────────────────────────────────────────────── */

/**
 * "Undo that": removes the most recent log from the last few minutes. A
 * sentence that logged two foods logged them together, so both go, and so
 * does the partner's half of anything you logged for both of you.
 */
export async function undoLast(me: User): Promise<string[]> {
  const rows = await sql<{ name: string; user_id: number }[]>`
    delete from food_entries
    where (user_id = ${me.id} or created_by = ${me.id})
      and created_at = (
        select max(created_at) from food_entries
        where user_id = ${me.id} and created_at > now() - make_interval(mins => ${CORRECTION_WINDOW_MIN})
      )
    returning name, user_id`;
  return rows.filter((r) => r.user_id === me.id).map((r) => r.name);
}

/** "Actually that was 2": re-resolves the newest entry's amount against its food. */
async function setLastAmount(me: User, quantity: number | null, unit: string | null) {
  const [last] = await sql<
    {
      id: number;
      name: string;
      food_id: number | null;
      kcal_100g: number;
      protein_100g: number;
      fat_100g: number;
      carbs_100g: number;
    }[]
  >`
    select id, name, food_id, kcal_100g, protein_100g, fat_100g, carbs_100g from food_entries
    where user_id = ${me.id} and created_at > now() - make_interval(mins => ${CORRECTION_WINDOW_MIN})
    order by created_at desc, id desc limit 1`;
  if (!last) return null;
  const [food] = last.food_id
    ? await sql<Pick<LibraryFood, "default_grams" | "servings">[]>`
        select f.default_grams,
               coalesce((select json_agg(json_build_object('label', s.label, 'grams', s.grams))
                         from food_servings s where s.food_id = f.id), '[]'::json) as servings
        from foods f where f.id = ${last.food_id}`
    : [];
  const f = food ?? { default_grams: 100, servings: [] };
  let amount = resolveAmount(f, quantity, unit);
  // "Actually that was 3" after "an oikos": with no piece weight, a count of
  // the same thing just logged means that many of its pack.
  if ("needsGrams" in amount && quantity) {
    const pack = f.servings.find((s) => s.label === "pack")?.grams;
    amount = { grams: quantity * (pack ?? f.default_grams ?? 100) };
  }
  if ("needsGrams" in amount) return null;
  await sql`update food_entries set grams = ${amount.grams} where id = ${last.id}`;
  const macros = macrosFor(amount.grams, {
    kcal: last.kcal_100g,
    protein_g: last.protein_100g,
    fat_g: last.fat_100g,
    carbs_g: last.carbs_100g,
  });
  return { name: last.name, grams: amount.grams, kcal: macros.kcal };
}

/* ─── Answering a pending item ───────────────────────────────────────────── */

export type Resolution = {
  phrase: string;
  foodId: number;
  quantity: number | null;
  unit: string | null;
  minutesAgo: number | null;
  /** Answers "what does one weigh?", and is saved as the food's piece serving. */
  gramsPerPiece?: number | null;
  /** Or simply how many grams this time. */
  grams?: number | null;
  /** Split it with your partner, half each. */
  shared?: boolean;
  /** Whose day it goes in. Overrides `shared` when given. */
  who?: "me" | "both" | "partner";
};

/**
 * The confirm sheet's answer to one pending item: which food it was, and if
 * need be what one piece weighs. Both are remembered, so the same sentence
 * never needs asking about again (§5.5).
 */
export async function resolvePending(me: User, r: Resolution, ctx: QuickContext) {
  const now = ctx.now ?? new Date();
  if (r.gramsPerPiece) {
    if (!(r.gramsPerPiece > 0 && r.gramsPerPiece < 5000)) throw new Error("That weight doesn't look right.");
    await sql`
      insert into food_servings (food_id, label, grams) values (${r.foodId}, 'piece', ${r.gramsPerPiece})
      on conflict (food_id, label) do update set grams = excluded.grams`;
  }
  const [food] = await sql<Pick<LibraryFood, "default_grams" | "servings">[]>`
    select f.default_grams,
           coalesce((select json_agg(json_build_object('label', s.label, 'grams', s.grams))
                     from food_servings s where s.food_id = f.id), '[]'::json) as servings
    from foods f where f.id = ${r.foodId} and f.status = 'confirmed'`;
  if (!food) throw new Error("That food isn't in the library yet.");
  const amount = r.grams ? { grams: r.grams } : resolveAmount(food, r.quantity, r.unit);
  if ("needsGrams" in amount) throw new Error("How much was it?");
  if (r.phrase.trim()) await learnAlias(r.foodId, r.phrase);
  const at = r.minutesAgo ? new Date(now.getTime() - r.minutesAgo * 60_000) : now;
  const base = { foodId: r.foodId, source: ctx.source, client: ctx.client, tz: ctx.tz, loggedAt: at, inputText: r.phrase };
  const who = r.who ?? (r.shared ? "both" : "me");
  const entry =
    who === "both"
      ? (await logShared(me, { ...base, myGrams: amount.grams / 2, partnerGrams: amount.grams / 2 })).mine!
      : who === "partner"
        ? (await logShared(me, { ...base, myGrams: 0, partnerGrams: amount.grams })).theirs!
        : await logEntry(me, me.id, { ...base, grams: amount.grams });
  return { entry, day: await getHealthDay(me, dateIn(ctx.tz, now)) };
}

/**
 * Undo from the toast: exactly the entries that were just added, which are
 * your own, plus the partner's half of any shared meal you logged with them.
 */
export async function deleteEntries(me: User, ids: number[]) {
  if (!ids.length) return;
  await sql`
    delete from food_entries
    where (user_id = ${me.id} and id = any(${ids}))
       -- Something you logged into your partner's day alone ("Bunny had one").
       or (created_by = ${me.id} and id = any(${ids}))
       or (created_by = ${me.id} and shared_meal_id in (
             select shared_meal_id from food_entries
             where user_id = ${me.id} and id = any(${ids}) and shared_meal_id is not null))`;
}
