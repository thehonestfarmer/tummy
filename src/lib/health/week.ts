import "server-only";
import { sql } from "../db";
import type { User } from "../auth";
import { partnerOf, targetFor } from "./entries";
import { shiftDate } from "./zone";

export type WeekDay = {
  date: string;
  /** What you ate that day, and what the target was on that day. */
  kcal: number;
  target: number | null;
  logged: boolean;
  /** Whether your partner logged anything; how much is theirs to show (§1, idea 8). */
  partnerLogged: boolean;
};

export type WeekView = {
  today: string;
  /** Monday to Sunday. */
  days: WeekDay[];
  /**
   * How far under target the week is, summed over finished days with
   * something logged; negative when it is over. Today is left out until it
   * is over, or every morning would open on a deficit of a whole day. A day
   * with nothing logged is a gap in the record, not a fast, so it is left
   * out too.
   */
  deficit: number;
  counted: number;
};

/** The Monday of the calendar week `date` falls in. */
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  return shiftDate(date, -((weekday + 6) % 7));
}

/** The calendar week around `date` (§8): each day's calories against its target, and the week's running deficit. */
export async function getWeek(me: User, date: string, today: string): Promise<WeekView> {
  const partner = await partnerOf(me);
  const monday = mondayOf(date);
  const dates = Array.from({ length: 7 }, (_, i) => shiftDate(monday, i));

  const [rows, targets] = await Promise.all([
    sql<{ user_id: number; day: string; kcal: number }[]>`
      select user_id, to_char(local_date, 'YYYY-MM-DD') as day, sum(grams * kcal_100g / 100)::float8 as kcal
      from food_entries
      where user_id in (${me.id}, ${partner.id}) and local_date between ${monday} and ${dates[6]}
      group by user_id, local_date`,
    Promise.all(dates.map((d) => targetFor(me.id, d))),
  ]);

  const days = dates.map((d, i): WeekDay => {
    const mine = rows.find((r) => r.user_id === me.id && r.day === d);
    return {
      date: d,
      kcal: Math.round(mine?.kcal ?? 0),
      target: targets[i] ? Math.round(targets[i]!.kcal) : null,
      logged: mine !== undefined,
      partnerLogged: rows.some((r) => r.user_id === partner.id && r.day === d),
    };
  });

  const finished = days.filter((d) => d.date < today && d.logged && d.target !== null);
  return {
    today,
    days,
    deficit: finished.reduce((n, d) => n + (d.target! - d.kcal), 0),
    counted: finished.length,
  };
}
