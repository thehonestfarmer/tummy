import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "../db";
import type { User } from "../auth";
import type { Client } from "./client";

/**
 * Questions a tool asked, waiting for a person's answer (mcpspec.md §4.4).
 * A tool that can't resolve something returns `needs_choice` with a token
 * instead of guessing; the assistant asks, then calls resolve_choice. The
 * question's details stay on the server, so the answer applies to exactly
 * what was asked about, however the chat summarised it in between.
 */

const LIFETIME_MIN = 30;

export type ChoiceKind = "log_item" | "duplicate";

export async function askChoice<P>(me: User, client: Client, kind: ChoiceKind, payload: P): Promise<string> {
  const token = randomBytes(9).toString("base64url");
  await sql`delete from choices where expires_at < now()`;
  await sql`
    insert into choices (token, user_id, kind, payload, client, expires_at)
    values (${token}, ${me.id}, ${kind}, ${sql.json(payload as never)}, ${client},
            now() + make_interval(mins => ${LIFETIME_MIN}))`;
  return token;
}

export type Choice<P> = { kind: ChoiceKind; payload: P; askedAt: Date };

/** The question behind a token, if it's still open and it's yours. */
export async function openChoice<P>(me: User, token: string): Promise<Choice<P>> {
  const [row] = await sql<{ kind: ChoiceKind; payload: P; created_at: Date }[]>`
    select kind, payload, created_at from choices
    where token = ${token} and user_id = ${me.id} and expires_at > now()`;
  if (!row) throw new Error("That question has expired or was already answered. Ask the tool again.");
  return { kind: row.kind, payload: row.payload, askedAt: row.created_at };
}

/** Closes a question once its answer has been applied, so it can't be answered twice. */
export async function closeChoice(token: string) {
  await sql`delete from choices where token = ${token}`;
}
