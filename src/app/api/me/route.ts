import { withUser } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET() {
  return withUser(async (user) => ({ slug: user.slug, displayName: user.displayName }));
}
