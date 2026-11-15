import "server-only";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import { targetFor } from "./entries";
import type { Macros } from "./reading";
import { RUN_SHARE } from "./runs";
import { shiftDate } from "./zone";

/*
 * Maintenance (healthspec.md §6.3): what a person burns on a day without a
 * run. It starts as a formula's guess from height, age, sex and weight, and
 * is pulled toward what the food log and the weigh-ins actually show as
 * they build up. Nothing here is stored: it is worked out on read, and a
 * target changes only when its owner says so.
 */

/** Energy in a kilogram of body weight gained or lost, taken as fat. Gains on a slow bulk hold a little less. */
const KCAL_PER_KG = 7700;
/** How far back the data is read. */
const WINDOW_DAYS = 56;
/** Days of data at which the formula and the data count the same. */
const HALF_AT = 21;
/** The least there must be before the data says anything. */
const MIN_WEIGH_INS = 5;
const MIN_SPAN_DAYS = 7;
const MIN_FOOD_DAYS = 5;

export type Profile = {
  heightCm: number | null;
  birthYear: number | null;
  sex: "male" | "female" | null;
  activity: number;
  goalKgWeek: number;
};

export type MaintenanceView = {
  profile: Profile;
  /** The standing target, without any run. */
  target: Macros | null;
  /** The weight the formula used: the latest 7-day average. */
  weightKg: number | null;
  /** Mifflin-St Jeor resting burn × activity. Null until there is a weigh-in and a full profile. */
  formula: number | null;
  /** What the log and the scale show, or null with `waiting` saying what is missing. */
  measured: {
    kcal: number;
    /** Days of food counted, and weigh-ins, in the window. */
    foodDays: number;
    weighIns: number;
    spanDays: number;
    intake: number;
    kgPerWeek: number;
    runPerDay: number;
  } | null;
  waiting: string | null;
  /** How much of the estimate is the data, 0 to 1. */
  share: number;
  estimate: number | null;
  /** Roughly how far either side the truth may lie. */
  band: number;
  /** The daily surplus or deficit the goal asks for. */
  goalKcal: number;
  /** A target that fits the estimate and the goal, when the standing one is more than 100 kcal off. */
  proposed: Macros | null;
  /** How the 7-day average should move per week at the standing target, by the estimate. */
  forecastKgWeek: number | null;
};

const round25 = (n: number) => Math.round(n / 25) * 25;

export async function getProfile(userId: number): Promise<Profile> {
  const [row] = await sql<{ height_cm: number | null; birth_year: number | null; sex: Profile["sex"]; activity: number; goal_kg_week: number }[]>`
    select height_cm, birth_year, sex, activity, goal_kg_week from profiles where user_id = ${userId}`;
  return row
    ? { heightCm: row.height_cm, birthYear: row.birth_year, sex: row.sex, activity: row.activity, goalKgWeek: row.goal_kg_week }
    : { heightCm: null, birthYear: null, sex: null, activity: 1.5, goalKgWeek: 0 };
}

const ProfileInput = z.object({
  heightCm: z.number().min(100).max(230).nullable(),
  birthYear: z.number().int().min(1920).max(2020).nullable(),
  sex: z.enum(["male", "female"]).nullable(),
  activity: z.number().min(1.2).max(2.2),
  goalKgWeek: z.number().min(-1).max(1),
});

export async function setProfile(me: User, raw: unknown): Promise<void> {
  const parsed = ProfileInput.safeParse(raw);
  if (!parsed.success) throw new Error("Some of those don't look right.");
  const p = parsed.data;
  await sql`
    insert into profiles (user_id, height_cm, birth_year, sex, activity, goal_kg_week)
    values (${me.id}, ${p.heightCm}, ${p.birthYear}, ${p.sex}, ${p.activity}, ${p.goalKgWeek})
    on conflict (user_id) do update set height_cm = excluded.height_cm, birth_year = excluded.birth_year, sex = excluded.sex,
      activity = excluded.activity, goal_kg_week = excluded.goal_kg_week, updated_at = now()`;
}

const TargetInput = z.object({
  kcal: z.number().min(800).max(8000),
  protein_g: z.number().min(0).max(500),
  fat_g: z.number().min(0).max(400),
  carbs_g: z.number().min(0).max(1500),
});

/** A new standing target from today on. Past days keep the target they had (§6.1). */
export async function setTarget(me: User, today: string, raw: unknown, reason: string): Promise<void> {
  const parsed = TargetInput.safeParse(raw);
  if (!parsed.success) throw new Error("A target needs calories, protein, fat and carbs.");
  const t = parsed.data;
  await sql`
    insert into targets (user_id, effective_date, kcal, protein_g, fat_g, carbs_g, status, reason)
    values (${me.id}, ${today}, ${Math.round(t.kcal)}, ${t.protein_g}, ${t.fat_g}, ${t.carbs_g}, 'active', ${reason})`;
}

const dayNo = (d: string) => Math.round(new Date(`${d}T00:00:00Z`).getTime() / 86_400_000);

export async function getMaintenance(me: User, today: string): Promise<MaintenanceView> {
  const since = shiftDate(today, -WINDOW_DAYS);
  const yesterday = shiftDate(today, -1);
  const [profile, target, weighIns, [recent]] = await Promise.all([
    getProfile(me.id),
    targetFor(me.id, today, []),
    sql<{ date: string; kg: number }[]>`
      select to_char(local_date, 'YYYY-MM-DD') as date, weight_kg as kg from weigh_ins
      where user_id = ${me.id} and local_date between ${since} and ${today} order by local_date`,
    sql<{ kg: number | null }[]>`
      select avg(weight_kg)::float8 as kg from (
        select weight_kg from weigh_ins where user_id = ${me.id} and local_date <= ${today} order by local_date desc limit 7) w`,
  ]);
  const weightKg = recent?.kg ?? null;

  const age = profile.birthYear ? Number(today.slice(0, 4)) - profile.birthYear : null;
  const resting =
    weightKg !== null && profile.heightCm && age !== null && profile.sex
      ? 10 * weightKg + 6.25 * profile.heightCm - 5 * age + (profile.sex === "male" ? 5 : -161)
      : null;
  const formula = resting === null ? null : resting * profile.activity;

  // What the log and the scale show, from the first weigh-in in the window to yesterday: today's food isn't finished.
  let measured: MaintenanceView["measured"] = null;
  let waiting: string | null = null;
  const first = weighIns[0]?.date;
  const spanDays = first ? dayNo(today) - dayNo(first) : 0;
  if (weighIns.length < MIN_WEIGH_INS || spanDays < MIN_SPAN_DAYS) {
    const need = Math.max(MIN_WEIGH_INS - weighIns.length, 0);
    waiting = need
      ? `Your own numbers start counting after ${need} more weigh-in${need === 1 ? "" : "s"}.`
      : `Your own numbers start counting once the weigh-ins span a week (${MIN_SPAN_DAYS - spanDays} more day${MIN_SPAN_DAYS - spanDays === 1 ? "" : "s"}).`;
  } else {
    const [food, [ran]] = await Promise.all([
      sql<{ kcal: number }[]>`
        select sum(grams * kcal_100g / 100)::float8 as kcal from food_entries
        where user_id = ${me.id} and local_date between ${first!} and ${yesterday} group by local_date`,
      sql<{ kcal: number }[]>`
        select coalesce(sum(kcal), 0)::float8 as kcal from runs where user_id = ${me.id} and local_date between ${first!} and ${yesterday}`,
    ]);
    // A day with only a snack logged is a gap in the record, not a fast.
    const floor = resting === null ? 800 : resting * 0.6;
    const full = food.filter((f) => f.kcal >= floor);
    if (full.length < MIN_FOOD_DAYS) {
      waiting = `Your own numbers start counting after ${MIN_FOOD_DAYS - full.length} more fully logged day${MIN_FOOD_DAYS - full.length === 1 ? "" : "s"} of food.`;
    } else {
      const intake = full.reduce((n, f) => n + f.kcal, 0) / full.length;
      // The slope of a line through every weigh-in: steadier than comparing two ends.
      const xs = weighIns.map((w) => dayNo(w.date));
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length;
      const my = weighIns.reduce((a, w) => a + w.kg, 0) / weighIns.length;
      const slope = xs.reduce((a, x, i) => a + (x - mx) * (weighIns[i].kg - my), 0) / xs.reduce((a, x) => a + (x - mx) ** 2, 0);
      // Runs are paid for on the day by a higher target, so they come out of the everyday figure.
      const runPerDay = (ran.kcal * RUN_SHARE) / spanDays;
      measured = {
        kcal: Math.round(intake - slope * KCAL_PER_KG - runPerDay),
        foodDays: full.length,
        weighIns: weighIns.length,
        spanDays,
        intake: Math.round(intake),
        kgPerWeek: Math.round(slope * 7 * 100) / 100,
        runPerDay: Math.round(runPerDay),
      };
    }
  }

  const days = measured ? Math.min(measured.foodDays, measured.weighIns) : 0;
  // With no formula to lean on, the data stands alone, but only once there is a fortnight of it.
  const share = formula === null ? (days >= 14 ? 1 : 0) : days / (days + HALF_AT);
  const estimate =
    formula !== null ? round25(formula * (1 - share) + (measured?.kcal ?? formula) * share) : measured && share === 1 ? round25(measured.kcal) : null;
  const band = Math.round((250 - 110 * (formula === null ? 0.5 : share)) / 10) * 10;

  const goalKcal = Math.round((profile.goalKgWeek * KCAL_PER_KG) / 7);
  let proposed: Macros | null = null;
  if (estimate !== null && target) {
    const kcal = round25(estimate + goalKcal);
    if (Math.abs(kcal - target.kcal) > 100) {
      // Protein and fat stay as they are; carbs take up the change (§6.4).
      const carbs = Math.max(0, Math.round((kcal - target.protein_g * 4 - target.fat_g * 9) / 4 / 5) * 5);
      proposed = { kcal, protein_g: target.protein_g, fat_g: target.fat_g, carbs_g: carbs };
    }
  }

  return {
    profile,
    target,
    weightKg: weightKg === null ? null : Math.round(weightKg * 10) / 10,
    formula: formula === null ? null : round25(formula),
    measured,
    waiting,
    share: Math.round(share * 100) / 100,
    estimate,
    band,
    goalKcal,
    proposed,
    forecastKgWeek: estimate !== null && target ? Math.round((((target.kcal - estimate) * 7) / KCAL_PER_KG) * 100) / 100 : null,
  };
}
