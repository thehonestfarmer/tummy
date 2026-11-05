import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { connect } from "./sql.mjs";

const sql = connect();

await sql`create table if not exists _migrations (
  name text primary key, run_at timestamptz not null default now()
)`;

const dir = path.join(process.cwd(), "db", "migrations");
const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();
const done = new Set((await sql`select name from _migrations`).map((r) => r.name));

for (const file of files) {
  if (done.has(file)) {
    console.log(`  skip  ${file}`);
    continue;
  }
  const body = await readFile(path.join(dir, file), "utf8");
  await sql.unsafe(body);
  await sql`insert into _migrations (name) values (${file})`;
  console.log(`  ran   ${file}`);
}

await sql.end();
console.log("migrations up to date");
