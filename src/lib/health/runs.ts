import "server-only";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import { claudeJson } from "./claude";
import type { Client } from "./client";
import { visionModels } from "./vision";
import { isDate } from "./zone";

/*
 * Runs (healthspec.md §7.6). There is no Strava connection: a run arrives
 * as a screenshot of the activity, read by Claude in a chat or here, or as
 * numbers typed in. Its calories raise that day's target (`targetFor`).
 */

export type RunView = {
  id: number;
  date: string;
  km: number;
  seconds: number | null;
  /** What the run burned: Strava's figure, or the estimate. */
  kcal: number;
  /** What it adds to the day's target: `RUN_SHARE` of that. */
  added: number;
  /** Whether the calories are Strava's own or worked out from weight and distance. */
  kcalFrom: "strava" | "estimate";
  name: string | null;
};

/** Running costs about one kilocalorie per kilogram of body weight per kilometre, at any pace. */
const KCAL_PER_KG_KM = 1;

/**
 * How much of a run's calories goes back onto the day's target (settled
 * 2026-11-15). Not all of it, for two reasons: about a tenth of the figure
 * is resting metabolism the base target already covers, and across people
 * about 28% of what activity burns is offset elsewhere in the day (Careau et
 * al., Current Biology 2021). 0.9 × 0.72 ≈ 0.65. The one number to change
 * once our own weight trend says otherwise.
 */
export const RUN_SHARE = 0.65;

type Row = { id: number; date: string; distance_km: number; seconds: number | null; kcal: number; kcal_from: "strava" | "estimate"; name: string | null };

const toRun = (r: Row): RunView => ({
  id: r.id,
  date: r.date,
  km: r.distance_km,
  seconds: r.seconds,
  kcal: r.kcal,
  added: Math.round(r.kcal * RUN_SHARE),
  kcalFrom: r.kcal_from,
  name: r.name,
});

export async function runsOn(userId: number, date: string): Promise<RunView[]> {
  const rows = await sql<Row[]>`
    select id, to_char(local_date, 'YYYY-MM-DD') as date, distance_km, seconds, kcal, kcal_from, name
    from runs where user_id = ${userId} and local_date = ${date} order by id`;
  return rows.map(toRun);
}

/** The latest runs, newest first. */
export async function recentRuns(userId: number, sinceDate: string | null = null, limit = 30): Promise<RunView[]> {
  const rows = await sql<Row[]>`
    select id, to_char(local_date, 'YYYY-MM-DD') as date, distance_km, seconds, kcal, kcal_from, name
    from runs where user_id = ${userId} and (${sinceDate}::date is null or local_date >= ${sinceDate}::date)
    order by local_date desc, id desc limit ${limit}`;
  return rows.map(toRun);
}

/** What a day's runs add to its target, in kcal. */
export const runAllowance = (runs: RunView[]) => runs.reduce((n, r) => n + r.added, 0);

export const RunInput = z.object({
  date: z.string().refine(isDate),
  km: z.number().positive().max(500),
  seconds: z.number().int().positive().max(200_000).nullable().optional(),
  kcal: z.number().min(0).max(20_000).nullable().optional(),
  name: z.string().trim().max(120).nullable().optional(),
});

/**
 * Records a run for `person`. With no calories given they are estimated from
 * the person's latest weigh-in and the distance. The same run sent again
 * (same day, distance and time) updates the first rather than adding a second.
 */
export async function logRun(
  person: User,
  today: string,
  raw: unknown,
  ctx: { source: "touch" | "screenshot" | "mcp"; client?: Client; enteredBy?: User },
): Promise<RunView> {
  const parsed = RunInput.safeParse(raw);
  if (!parsed.success) throw new Error("A run needs its date and its distance in kilometres.");
  const p = parsed.data;
  if (p.date > today) throw new Error("That day hasn't happened yet.");

  let kcal = p.kcal ?? null;
  const from = kcal === null ? "estimate" : "strava";
  if (kcal === null) {
    const [w] = await sql<{ kg: number }[]>`
      select weight_kg as kg from weigh_ins where user_id = ${person.id} and local_date <= ${p.date} order by local_date desc limit 1`;
    if (!w) throw new Error(`There's no calorie figure for that run and no weigh-in for ${person.displayName} to estimate it from. Give the calories Strava shows, or weigh in first.`);
    kcal = w.kg * p.km * KCAL_PER_KG_KM;
  }
  const km = Math.round(p.km * 100) / 100;
  const [row] = await sql<Row[]>`
    insert into runs (user_id, local_date, distance_km, seconds, kcal, kcal_from, name, source, client, entered_by)
    values (${person.id}, ${p.date}, ${km}, ${p.seconds ?? null}, ${Math.round(kcal)}, ${from}, ${p.name || null},
            ${ctx.source}, ${ctx.client ?? "pwa"}, ${(ctx.enteredBy ?? person).id})
    on conflict (user_id, local_date, distance_km, coalesce(seconds, 0))
    do update set kcal = excluded.kcal, kcal_from = excluded.kcal_from, name = coalesce(excluded.name, runs.name)
    returning id, to_char(local_date, 'YYYY-MM-DD') as date, distance_km, seconds, kcal, kcal_from, name`;
  return toRun(row);
}

export async function deleteRun(person: User, id: number): Promise<string | null> {
  const [row] = await sql<{ date: string }[]>`
    delete from runs where id = ${id} and user_id = ${person.id} returning to_char(local_date, 'YYYY-MM-DD') as date`;
  return row?.date ?? null;
}

const ShotSchema = z.object({
  is_run: z.boolean().describe("True only if this is one finished activity that was a run (outdoor, treadmill or trail). A walk, ride, hike or anything else is false."),
  activity: z.string().describe("What the screenshot shows, in a few words: 'Morning Run', 'a ride', 'a feed of several activities', 'not Strava'."),
  date: z.string().nullable().describe("The day the run was done, YYYY-MM-DD. Work out 'Today' and 'Yesterday' from the date given. Null if it can't be told."),
  distance_km: z.number().nullable().describe("Distance in kilometres. Convert miles (×1.609). Null if not shown."),
  moving_seconds: z.number().nullable().describe("Moving time in seconds (not elapsed time, if both show). Null if not shown."),
  calories: z.number().nullable().describe("Calories, only if the screenshot prints a figure. Never estimate one."),
});

export type RunShot = z.infer<typeof ShotSchema>;

const SYSTEM = `You read one screenshot of a finished activity from the Strava phone app for a two-person \
nutrition tracker. Report only what is printed. Numbers use a decimal point or a decimal comma depending on \
the phone's language. Never guess a figure that isn't shown.`;

/** Reads a Strava screenshot. The person checks the numbers before anything is saved. */
export async function readRunShot(jpeg: Buffer, today: string): Promise<RunShot> {
  const { output } = await claudeJson({
    model: visionModels().find((m) => m.startsWith("claude")) ?? "claude-opus-5",
    effort: "low",
    system: SYSTEM,
    content: [
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: jpeg.toString("base64") } },
      { type: "text", text: `Today is ${today}. Read this activity.` },
    ],
    schema: ShotSchema,
    task: "read that screenshot",
  });
  return output;
}
