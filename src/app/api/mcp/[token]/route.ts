import { mcpHandlerFor } from "@/lib/health/mcp";
import { userByToken } from "@/lib/health/tokens";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string }> };

/**
 * /api/mcp/<secret>: the Claude connector (healthspec.md §10). Claude's
 * custom connectors can send no header, so the URL carries the credential,
 * and because each of you has your own, it also says whose log it is.
 *
 * A wrong secret is a 404, not a 401: a guessed URL learns nothing, not even
 * that the endpoint exists.
 */
async function handle(req: Request, ctx: Ctx) {
  const user = await userByToken((await ctx.params).token);
  if (!user) return new Response("Not Found", { status: 404 });
  return mcpHandlerFor(user)(req);
}

export { handle as GET, handle as POST, handle as DELETE };
