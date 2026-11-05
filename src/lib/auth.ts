import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { sql } from "./db";
import type { Slug } from "./config";

export const SESSION_COOKIE = "tb_session";
const YEAR_SECONDS = 60 * 60 * 24 * 365;

export type User = { id: number; slug: Slug; displayName: string };

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

function hmac(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("hex");
}

/**
 * Deterministic, so `users.pin_hash` can carry a real uniqueness constraint —
 * a salted digest would let two identical PINs coexist and lock one user out.
 */
export function pinHash(pin: string): string {
  return hmac(pin);
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function signSession(userId: number): string {
  return `${userId}.${hmac(String(userId))}`;
}

export function verifySession(value: string | undefined): number | null {
  if (!value) return null;
  const [id, mac] = value.split(".");
  if (!id || !mac || !/^\d+$/.test(id)) return null;
  return safeEqual(mac, hmac(id)) ? Number(id) : null;
}

export async function setSessionCookie(userId: number) {
  const store = await cookies();
  store.set(SESSION_COOKIE, signSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    // Plain HTTP over the LAN is how this gets tested on a phone in dev.
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: YEAR_SECONDS,
  });
}

export async function clearSessionCookie() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function getUser(): Promise<User | null> {
  const store = await cookies();
  const id = verifySession(store.get(SESSION_COOKIE)?.value);
  if (id === null) return null;
  const rows = await sql<
    { id: number; slug: Slug; display_name: string }[]
  >`select id, slug, display_name from users where id = ${id}`;
  if (!rows.length) return null;
  return { id: rows[0].id, slug: rows[0].slug, displayName: rows[0].display_name };
}

export async function userByPin(pin: string): Promise<User | null> {
  const rows = await sql<
    { id: number; slug: Slug; display_name: string }[]
  >`select id, slug, display_name from users where pin_hash = ${pinHash(pin)}`;
  if (!rows.length) return null;
  return { id: rows[0].id, slug: rows[0].slug, displayName: rows[0].display_name };
}

export async function bothUsers(): Promise<Record<Slug, User>> {
  const rows = await sql<
    { id: number; slug: Slug; display_name: string }[]
  >`select id, slug, display_name from users`;
  const out = {} as Record<Slug, User>;
  for (const r of rows) out[r.slug] = { id: r.id, slug: r.slug, displayName: r.display_name };
  return out;
}
