import { withUser } from "@/lib/api";
import { quickLog } from "@/lib/health/quicklog";
import { requestZone } from "@/lib/health/requestZone";

export const dynamic = "force-dynamic";

/** A typed sentence through quick log: "just had 1 shoyu senbei" (§5.5). */
export async function POST(req: Request) {
  const { text } = (await req.json().catch(() => ({}))) as { text?: unknown };
  const tz = await requestZone();
  return withUser((user) => quickLog(user, typeof text === "string" ? text : "", { tz, source: "touch" }));
}
