/**
 * Health's day is the phone's own calendar date (healthspec.md §4), unlike
 * the photo side, which keeps Tokyo's. The browser tells the server its time
 * zone through a cookie, which reaches page renders and API calls alike,
 * where a header would only reach the API.
 */
export const TZ_COOKIE = "tb_tz";

export function isTimeZone(tz: unknown): tz is string {
  if (typeof tz !== "string" || !tz || tz.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The calendar date at `at` in `tz`, as YYYY-MM-DD. */
export function dateIn(tz: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** "14:32" at `at` in `tz`. */
export function clockIn(tz: string, at: Date): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false }).format(at);
}

export function isDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}
