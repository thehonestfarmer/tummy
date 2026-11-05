import "server-only";
import { createHash } from "node:crypto";
import { sql } from "../db";
import type { User } from "../auth";

/**
 * Duplicate protection for writes over MCP (mcpspec.md §10). Chat apps
 * sometimes retry a tool call, and a retried "just had 1 senbei" must not be
 * two senbei. The same user calling the same tool with the same arguments
 * within a minute gets the first call's result back, and so does any call
 * repeating a request id the caller supplied.
 *
 * Calls are serialised per user and tool by an advisory lock, so a retry that
 * arrives while the first call is still running waits for it rather than
 * racing it.
 */

const WINDOW_SEC = 60;

export async function once<T>(
  me: User,
  tool: string,
  args: unknown,
  requestId: string | undefined,
  write: () => Promise<T>,
): Promise<T> {
  const hash = createHash("sha256").update(JSON.stringify(args ?? null)).digest("hex");
  return sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext(${`mcp:${me.id}:${tool}`}))`;
    const [seen] = await tx<{ result: T }[]>`
      select result from mcp_writes
      where user_id = ${me.id}
        and ((${requestId ?? null}::text is not null and request_id = ${requestId ?? null})
          or (tool = ${tool} and args_hash = ${hash} and created_at > now() - make_interval(secs => ${WINDOW_SEC})))
      order by created_at desc limit 1`;
    if (seen) return seen.result;
    const result = await write();
    await tx`delete from mcp_writes where created_at < now() - interval '1 day'`;
    await tx`
      insert into mcp_writes (user_id, tool, args_hash, request_id, result)
      values (${me.id}, ${tool}, ${hash}, ${requestId ?? null}, ${tx.json(result as never)})`;
    return result;
  }) as Promise<T>;
}
