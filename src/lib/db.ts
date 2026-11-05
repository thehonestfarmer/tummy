import postgres from "postgres";

declare global {
  var __tb_sql: ReturnType<typeof postgres> | undefined;
}

function connect() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    // Vercel's Postgres needs TLS; a local socket/host connection must not ask for it.
    ssl: url.includes("localhost") || url.includes("127.0.0.1") ? false : "require",
    max: 5,
    onnotice: () => {},
  });
}

export const sql = globalThis.__tb_sql ?? connect();
if (process.env.NODE_ENV !== "production") globalThis.__tb_sql = sql;
