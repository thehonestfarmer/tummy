import "server-only";
import type { TransactionSql } from "postgres";
import { sql } from "../db";
import { bothUsers, type User } from "../auth";
import { PAIR_ORDER, type Slug } from "../config";
import type { Client } from "./client";
import type { Macros } from "./reading";
import { clockIn, dateIn } from "./zone";

/**
 * The food log (healthspec.md §5.4) and the day it adds up to. Every number
 * here is computed by the server from grams × the per-100g snapshot on each
 * entry (§1, idea 3); the client and any assistant only ever display them.
 */

export type EntrySource = "touch" | "voice" | "mcp";

export type EntryView = {
  id: number;
  foodId: number | null;
  name: string;
  grams: number;
  macros: Macros;
  /** "14:32" in the zone it was logged in. */
  clock: string;
  /** The hour it falls in, for grouping a run of snacks. */
  hour: number;
  localDate: string;
  source: EntrySource;
  /** Set when the partner logged this half of a shared meal (§5.7). */
  addedBy: string | null;
  sharedMealId: number | null;
};

export type DaySide = {
  slug: Slug;
  displayName: string;
  totals: Macros;
  target: Macros | null;
};

export type HealthDayView = {
  date: string;
  me: DaySide & { entries: EntryView[] };
  partner: DaySide;
};

type EntryRow = {
  id: number;
  user_id: number;
  food_id: number | null;
  name: string;
  grams: number;
  kcal_100g: number;
  protein_100g: number;
  fat_100g: number;
  carbs_100g: number;
  logged_at: Date;
  tz: string;
  local_date: string;
  source: EntrySource;
  created_by: number | null;
  shared_meal_id: number | null;
};

const ZERO: Macros = { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function macrosFor(grams: number, per100: Macros): Macros {
  const k = grams / 100;
  return {
    kcal: Math.round(per100.kcal * k),
    protein_g: round1(per100.protein_g * k),
    fat_g: round1(per100.fat_g * k),
    carbs_g: round1(per100.carbs_g * k),
  };
}

const per100Of = (r: EntryRow): Macros => ({
  kcal: r.kcal_100g,
  protein_g: r.protein_100g,
  fat_g: r.fat_100g,
  carbs_g: r.carbs_100g,
});

function sum(entries: Macros[]): Macros {
  const t = entries.reduce(
    (acc, m) => ({
      kcal: acc.kcal + m.kcal,
      protein_g: acc.protein_g + m.protein_g,
      fat_g: acc.fat_g + m.fat_g,
      carbs_g: acc.carbs_g + m.carbs_g,
    }),
    ZERO,
  );
  return { kcal: Math.round(t.kcal), protein_g: round1(t.protein_g), fat_g: round1(t.fat_g), carbs_g: round1(t.carbs_g) };
}

export async function targetFor(userId: number, date: string): Promise<Macros | null> {
  const [row] = await sql<Macros[]>`
    select kcal, protein_g, fat_g, carbs_g from targets
    where user_id = ${userId} and status = 'active' and effective_date <= ${date}
    order by effective_date desc, id desc limit 1`;
  return row ?? null;
}

async function entriesFor(userId: number, date: string): Promise<EntryRow[]> {
  return sql<EntryRow[]>`
    select e.*, to_char(e.local_date, 'YYYY-MM-DD') as local_date
    from food_entries e
    where e.user_id = ${userId} and e.local_date = ${date}
    order by e.logged_at desc, e.id desc`;
}

function toEntry(r: EntryRow, names: Map<number, string>): EntryView {
  const hourText = clockIn(r.tz, r.logged_at);
  return {
    id: r.id,
    foodId: r.food_id,
    name: r.name,
    grams: r.grams,
    macros: macrosFor(r.grams, per100Of(r)),
    clock: hourText,
    hour: Number(hourText.slice(0, 2)),
    localDate: r.local_date,
    source: r.source,
    addedBy: r.created_by !== null && r.created_by !== r.user_id ? (names.get(r.created_by) ?? null) : null,
    sharedMealId: r.shared_meal_id,
  };
}

/**
 * Both of your days, side by side: yours in full, your partner's as totals (§8).
 * Called with the partner as `me`, it is their day in full, for looking at.
 */
export async function getHealthDay(me: User, date: string): Promise<HealthDayView> {
  const users = await bothUsers();
  const partner = PAIR_ORDER.map((s) => users[s]).find((u) => u.id !== me.id)!;
  const names = new Map(PAIR_ORDER.map((s) => [users[s].id, users[s].displayName]));

  const [mine, theirs, myTarget, theirTarget] = await Promise.all([
    entriesFor(me.id, date),
    entriesFor(partner.id, date),
    targetFor(me.id, date),
    targetFor(partner.id, date),
  ]);
  const entries = mine.map((r) => toEntry(r, names));

  return {
    date,
    me: {
      slug: me.slug,
      displayName: me.displayName,
      totals: sum(entries.map((e) => e.macros)),
      target: myTarget,
      entries,
    },
    partner: {
      slug: partner.slug,
      displayName: partner.displayName,
      totals: sum(theirs.map((r) => macrosFor(r.grams, per100Of(r)))),
      target: theirTarget,
    },
  };
}

type FoodForLog = {
  id: number;
  name: string;
  kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

export type LogInput = {
  foodId: number;
  grams: number;
  source: EntrySource;
  /** Required from MCP; anything else came from the app. */
  client?: Client;
  tz: string;
  loggedAt?: Date;
  /** For something forgotten on a past day: the day it belongs to, whatever the clock says now. */
  localDate?: string;
  inputText?: string | null;
  sharedMealId?: number | null;
};

type Db = TransactionSql | typeof sql;

/** An entry from MCP has to say which assistant sent it; everything else is the app. */
function clientOf(source: EntrySource, client: Client | undefined): Client {
  if (client) return client;
  if (source === "mcp") throw new Error("A log over MCP needs its client.");
  return "pwa";
}

/**
 * Writes one entry, snapshotting the food as it is now. Only a confirmed
 * food can be logged: a draft hasn't been checked by anyone, and the whole
 * point of the library is that nothing unchecked is ever counted (§10.1).
 */
export async function logEntry(user: User | { id: number }, createdBy: number, input: LogInput, db: Db = sql) {
  if (!(input.grams > 0) || input.grams > 100_000) throw new Error("That amount doesn't look right.");
  const [food] = await db<FoodForLog[]>`
    select id, name, kcal, protein_g, fat_g, carbs_g from foods
    where id = ${input.foodId} and status = 'confirmed'`;
  if (!food) throw new Error("That food isn't in the library yet.");
  const at = input.loggedAt ?? new Date();
  const [row] = await db<{ id: number }[]>`
    insert into food_entries
      (user_id, food_id, grams, name, kcal_100g, protein_100g, fat_100g, carbs_100g,
       logged_at, tz, local_date, source, client, input_text, created_by, shared_meal_id)
    values
      (${user.id}, ${food.id}, ${input.grams}, ${food.name}, ${food.kcal}, ${food.protein_g}, ${food.fat_g},
       ${food.carbs_g}, ${at}, ${input.tz}, ${input.localDate ?? dateIn(input.tz, at)}, ${input.source},
       ${clientOf(input.source, input.client)}, ${input.inputText ?? null}, ${createdBy}, ${input.sharedMealId ?? null})
    returning id`;
  return { id: row.id, name: food.name, grams: input.grams, macros: macrosFor(input.grams, food) };
}

/** Your own entries only: the partner's half of a shared meal is theirs to change (§5.7). */
export async function updateEntry(me: User, id: number, patch: { grams?: unknown; localDate?: unknown }) {
  const grams = patch.grams === undefined ? undefined : Number(patch.grams);
  if (grams !== undefined && !(grams > 0 && grams <= 100_000)) throw new Error("That amount doesn't look right.");
  const date = patch.localDate;
  if (date !== undefined && !(typeof date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(date))) {
    throw new Error("That date doesn't look right.");
  }
  const rows = await sql`
    update food_entries set
      grams = coalesce(${grams ?? null}, grams),
      local_date = coalesce(${(date as string | undefined) ?? null}::date, local_date)
    where id = ${id} and user_id = ${me.id}
    returning id`;
  if (!rows.length) throw new Error("That entry isn't one of yours, or it's gone.");
}

/**
 * Your own entry. With `both`, the partner's half of the same shared meal
 * too, since either of you can log a shared meal into both days (§5.7).
 */
export async function deleteEntry(me: User, id: number, both = false): Promise<string[]> {
  const rows = await sql<{ name: string }[]>`
    delete from food_entries
    where (id = ${id} and user_id = ${me.id})
       or (${both} and shared_meal_id is not null and shared_meal_id = (
             select shared_meal_id from food_entries where id = ${id} and user_id = ${me.id}))
    returning name`;
  return rows.map((r) => r.name);
}

/**
 * Turns a draft's waiting logs into entries once it is confirmed (§5.2): the
 * "apple, 180 grams" said before anyone had confirmed what an apple is.
 */
export async function flushPendingLogs(foodId: number, db: Db) {
  const pending = await db<
    {
      id: number;
      user_id: number;
      grams: number | null;
      logged_at: Date;
      tz: string;
      source: EntrySource;
      client: Client;
      input_text: string | null;
      created_by: number | null;
    }[]
  >`select * from pending_logs where food_id = ${foodId} order by id`;
  if (!pending.length) return;
  const [food] = await db<{ default_grams: number | null }[]>`select default_grams from foods where id = ${foodId}`;
  for (const p of pending) {
    await logEntry(
      { id: p.user_id },
      p.created_by ?? p.user_id,
      {
        foodId,
        grams: p.grams ?? food?.default_grams ?? 100,
        source: p.source,
        client: p.client,
        tz: p.tz,
        loggedAt: p.logged_at,
        inputText: p.input_text,
      },
      db,
    );
  }
  await db`delete from pending_logs where food_id = ${foodId}`;
}

export async function addPendingLog(
  userId: number,
  createdBy: number,
  foodId: number,
  input: {
    grams: number | null;
    tz: string;
    source: EntrySource;
    client?: Client;
    inputText?: string | null;
    loggedAt?: Date;
  },
) {
  const at = input.loggedAt ?? new Date();
  await sql`
    insert into pending_logs (food_id, user_id, grams, logged_at, tz, local_date, source, client, input_text, created_by)
    values (${foodId}, ${userId}, ${input.grams}, ${at}, ${input.tz}, ${dateIn(input.tz, at)}, ${input.source},
            ${clientOf(input.source, input.client)}, ${input.inputText ?? null}, ${createdBy})`;
}

/* ─── Shared meals (§5.7) ────────────────────────────────────────────────── */

export async function partnerOf(me: { id: number }): Promise<User> {
  const users = await bothUsers();
  return PAIR_ORDER.map((s) => users[s]).find((u) => u.id !== me.id)!;
}

/**
 * One food eaten together: an entry in each of your days, tied by a shared
 * meal so either half can be found from the other. Either of you can log it
 * for both; the partner's half is marked as added by whoever logged it.
 */
export async function logShared(
  me: User,
  input: Omit<LogInput, "grams" | "sharedMealId"> & { myGrams: number; partnerGrams: number },
  db: Db = sql,
) {
  const partner = await partnerOf(me);
  const run = async (tx: Db) => {
    const [{ id: mealId }] = await tx<{ id: number }[]>`
      insert into shared_meals (created_by) values (${me.id}) returning id`;
    const mine = input.myGrams > 0 ? await logEntry(me, me.id, { ...input, grams: input.myGrams, sharedMealId: mealId }, tx) : null;
    const theirs =
      input.partnerGrams > 0
        ? await logEntry(partner, me.id, { ...input, grams: input.partnerGrams, sharedMealId: mealId }, tx)
        : null;
    return { mine, theirs, partner };
  };
  return db === sql ? sql.begin(run) : run(db);
}

/* ─── Recents (§5.6) ─────────────────────────────────────────────────────── */

export type RecentFood = { foodId: number; name: string; nameJa: string | null; grams: number; kcal: number };

/** What you've logged in the last two weeks, most recent first, each with the amount you had last time. */
export async function recentFoods(me: User): Promise<RecentFood[]> {
  const rows = await sql<
    { food_id: number; name: string; name_ja: string | null; grams: number; kcal: number; logged_at: Date }[]
  >`
    select distinct on (e.food_id) e.food_id, f.name, f.name_ja, e.grams, f.kcal, e.logged_at
    from food_entries e join foods f on f.id = e.food_id and f.status = 'confirmed'
    where e.user_id = ${me.id} and e.logged_at > now() - interval '14 days'
    order by e.food_id, e.logged_at desc`;
  return rows
    .sort((a, b) => b.logged_at.getTime() - a.logged_at.getTime())
    .slice(0, 20)
    .map((r) => ({
      foodId: r.food_id,
      name: r.name,
      nameJa: r.name_ja,
      grams: r.grams,
      kcal: Math.round((r.kcal * r.grams) / 100),
    }));
}
