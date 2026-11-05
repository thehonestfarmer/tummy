import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "../db";
import type { Slug } from "../config";
import type { User } from "../auth";

/**
 * The per-person secret behind the MCP connector (mcpspec.md §12, migration
 * 001). Long and random, so it can sit in a URL; the PIN can't.
 */
export async function tokenFor(user: User): Promise<string> {
  const [row] = await sql<{ api_token: string | null }[]>`select api_token from users where id = ${user.id}`;
  return row?.api_token ?? regenerateToken(user);
}

/** A new secret; the old one stops working at once, in Claude and ChatGPT alike. */
export async function regenerateToken(user: User): Promise<string> {
  const token = randomBytes(24).toString("base64url");
  await sql`update users set api_token = ${token} where id = ${user.id}`;
  return token;
}

export async function userByToken(token: string): Promise<User | null> {
  if (!/^[A-Za-z0-9_-]{24,}$/.test(token)) return null;
  const [row] = await sql<{ id: number; slug: Slug; display_name: string }[]>`
    select id, slug, display_name from users where api_token = ${token}`;
  return row ? { id: row.id, slug: row.slug, displayName: row.display_name } : null;
}

/** With no phone in the request, the zone of your latest log stands in for "today". */
export async function lastZoneOf(userId: number): Promise<string | null> {
  const [row] = await sql<{ tz: string }[]>`
    select tz from food_entries where user_id = ${userId} order by logged_at desc limit 1`;
  return row?.tz ?? null;
}
