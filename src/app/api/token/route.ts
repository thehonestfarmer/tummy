import { withUser } from "@/lib/api";
import { regenerateToken, tokenFor } from "@/lib/health/tokens";

export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async (user) => ({ token: await tokenFor(user) }));
}

/** A new secret. Claude and ChatGPT both need the new link afterwards. */
export async function POST() {
  return withUser(async (user) => ({ token: await regenerateToken(user) }));
}
