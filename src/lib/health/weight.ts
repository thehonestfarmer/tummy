import "server-only";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import { isDate } from "./zone";

/*
 * Weigh-ins (healthspec.md §6.2). One a day, each person's own. A single
 * morning's number moves with water and salt, so what is judged is the
 * average of the last seven days and how that has moved in a week.
 */

export type WeightView = {
  /** The weigh-in on the day on show, if there is one. */
  kg: number | null;
  /** The latest weigh-in before that day: where the stepper starts. */
  last: { date: string; kg: number } | null;
  /** The average of the weigh-ins in the seven days ending on that day. */
  avg: number | null;
  /** That average less the same average a week earlier. */
  change: number | null;
};

export const NO_WEIGHT: WeightView = { kg: null, last: null, avg: null, change: null };

const tenth = (n: number) => Math.round(n * 10) / 10;

export async function getWeight(userId: number, date: string): Promise<WeightView> {
  const [[row], [last]] = await Promise.all([
    sql<{ kg: number | null; avg: number | null; before: number | null }[]>`
      select
        (select weight_kg from weigh_ins where user_id = ${userId} and local_date = ${date}) as kg,
        (select avg(weight_kg)::float8 from weigh_ins
          where user_id = ${userId} and local_date between ${date}::date - 6 and ${date}::date) as avg,
        (select avg(weight_kg)::float8 from weigh_ins
          where user_id = ${userId} and local_date between ${date}::date - 13 and ${date}::date - 7) as before`,
    sql<{ date: string; kg: number }[]>`
      select to_char(local_date, 'YYYY-MM-DD') as date, weight_kg as kg from weigh_ins
      where user_id = ${userId} and local_date < ${date} order by local_date desc limit 1`,
  ]);
  return {
    kg: row.kg,
    last: last ?? null,
    avg: row.avg === null ? null : tenth(row.avg),
    change: row.avg === null || row.before === null ? null : tenth(row.avg - row.before),
  };
}

const WeighIn = z.object({ date: z.string().refine(isDate), kg: z.number().min(20).max(400) });

/** Today's weigh-in, or a past day's that was missed. Weighing again the same day replaces it. */
export async function setWeight(me: User, today: string, raw: unknown): Promise<string> {
  const parsed = WeighIn.safeParse(raw);
  if (!parsed.success) throw new Error("A weigh-in is a weight in kilograms.");
  const { date, kg } = parsed.data;
  if (date > today) throw new Error("That day hasn't happened yet.");
  await sql`
    insert into weigh_ins (user_id, local_date, weight_kg) values (${me.id}, ${date}, ${tenth(kg)})
    on conflict (user_id, local_date) do update set weight_kg = excluded.weight_kg, updated_at = now()`;
  return date;
}

export async function clearWeight(me: User, date: string): Promise<void> {
  await sql`delete from weigh_ins where user_id = ${me.id} and local_date = ${date}`;
}

export type WeightPoint = { date: string; kg: number; avg: number };

export type WeightTrend = {
  today: string;
  /** Each weigh-in in the window with the 7-day average as it stood that day, oldest first. */
  points: WeightPoint[];
};

/** The last eight weeks of weigh-ins, for the trend (§8). */
export async function getWeightTrend(me: User, today: string, days = 56): Promise<WeightTrend> {
  const points = await sql<WeightPoint[]>`
    select to_char(w.local_date, 'YYYY-MM-DD') as date, w.weight_kg as kg,
           (select avg(x.weight_kg)::float8 from weigh_ins x
             where x.user_id = w.user_id and x.local_date between w.local_date - 6 and w.local_date) as avg
    from weigh_ins w
    where w.user_id = ${me.id} and w.local_date > ${today}::date - ${days}::int and w.local_date <= ${today}
    order by w.local_date`;
  return { today, points: points.map((p) => ({ date: p.date, kg: p.kg, avg: tenth(p.avg) })) };
}
