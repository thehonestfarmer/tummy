import postgres from "postgres";

type Sql = ReturnType<typeof postgres>;

declare global {
  var __tb_sql: Sql | undefined;
}

function noTls(url: string): boolean {
  return url.includes("localhost") || url.includes("127.0.0.1") || url.includes("sslmode=disable");
}

function connect(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return postgres(url, {
    // Hosted Postgres needs TLS; a local database, or one on a private network that says
    // sslmode=disable, must not ask for it.
    ssl: noTls(url) ? false : "require",
    max: 5,
    onnotice: () => {},
  });
}

let instance: Sql | undefined;

function db(): Sql {
  instance ??= globalThis.__tb_sql ?? connect();
  // Dev reloads modules on every change; one pool survives them all.
  if (process.env.NODE_ENV !== "production") globalThis.__tb_sql = instance;
  return instance;
}

/**
 * The pool, made on first use rather than at import. `next build` imports
 * every route to collect its config, and the image is built with no
 * database to hand (healthspec.md §3).
 */
export const sql: Sql = new Proxy(connect as unknown as Sql, {
  apply: (_target, _this, args) => (db() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_target, prop) => {
    const value = Reflect.get(db(), prop);
    return typeof value === "function" ? value.bind(db()) : value;
  },
});
