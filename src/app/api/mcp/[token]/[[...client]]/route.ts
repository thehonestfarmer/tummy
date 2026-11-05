import { mcpHandlerFor } from "@/lib/health/mcp";
import { userByToken } from "@/lib/health/tokens";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ token: string; client?: string[] }> };

/**
 * /api/mcp/<secret>: the connector for Claude, and /api/mcp/<secret>/chatgpt
 * the same for ChatGPT (mcpspec.md §12). Neither can send a header, so the
 * URL carries the credential, and because each of you has your own, it also
 * says whose log it is. The suffix only says which assistant to credit each
 * write to; the connection is stateless, so nothing else could.
 *
 * A wrong secret, or an unknown suffix, is a 404, not a 401: a guessed URL
 * learns nothing, not even that the endpoint exists.
 */
async function handle(req: Request, ctx: Ctx) {
  const { token, client = [] } = await ctx.params;
  const which = client.length === 0 ? "claude" : client.length === 1 && client[0] === "chatgpt" ? "chatgpt" : null;
  const user = which && (await userByToken(token));
  if (!user || !which) return new Response("Not Found", { status: 404 });
  return mcpHandlerFor(user, which)(req);
}

export { handle as GET, handle as POST, handle as DELETE };
