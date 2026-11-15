import { withUser } from "@/lib/api";
import { requestZone } from "@/lib/health/requestZone";
import { readRunShot } from "@/lib/health/runs";
import { dateIn } from "@/lib/health/zone";

export const dynamic = "force-dynamic";
// A model reads the picture, which takes a few seconds.
export const maxDuration = 60;

/** A Strava screenshot, as JPEG bytes, read into a run to check. Nothing is saved. */
export async function POST(req: Request) {
  const bytes = Buffer.from(await req.arrayBuffer());
  const today = dateIn(await requestZone());
  return withUser(async () => {
    if (!bytes.length || bytes.length > 8_000_000) throw new Error("That picture didn't arrive.");
    return readRunShot(bytes, today);
  });
}
