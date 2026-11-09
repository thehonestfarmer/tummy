import postgres from "postgres";
import { loadEnv } from "./env.mjs";

/**
 * Mirrors src/lib/db.ts. Hosted Postgres services refuse a plain
 * connection, and a local socket refuses an encrypted one, so the scripts have
 * to make the same call the app does. sslmode=disable in the URL turns TLS
 * off for a database on a private network.
 */
export function connect() {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    ssl: url.includes("localhost") || url.includes("127.0.0.1") || url.includes("sslmode=disable") ? false : "require",
    onnotice: () => {},
  });
}
