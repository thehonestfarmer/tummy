import "server-only";
import { cookies } from "next/headers";
import { ANCHOR_TZ } from "../config";
import { isTimeZone, TZ_COOKIE } from "./zone";

/**
 * The time zone of the phone making this request. Before the first page has
 * set the cookie, the app's anchor zone stands in: in Japan, Korea and
 * Taiwan the date is the same anyway (§4).
 */
export async function requestZone(): Promise<string> {
  const raw = (await cookies()).get(TZ_COOKIE)?.value;
  let tz = raw;
  try {
    tz = raw && decodeURIComponent(raw);
  } catch {
    // A mangled cookie is just a missing one.
  }
  return isTimeZone(tz) ? tz : ANCHOR_TZ;
}
