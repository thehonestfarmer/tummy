/**
 * Loads db/reference/mext-2023.csv into `reference_foods` (healthspec.md §5.8).
 * Idempotent: rows are upserted on the food number, so it is safe to rerun
 * after MEXT publishes corrections. Run it against each database, like
 * `migrate`:
 *
 *   bun run seed:reference
 *   DATABASE_URL='<unpooled>' bun run seed:reference
 */
import { readFileSync } from "node:fs";
import { connect } from "./sql.mjs";
import { fold } from "../src/lib/health/fold";

function parseLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

const num = (s: string) => (s === "" ? null : Number(s));

const lines = readFileSync("db/reference/mext-2023.csv", "utf8").trim().split("\n").slice(1);
const rows = lines.map((line) => {
  const [food_number, food_group, name, kcal, protein, fat, carbs] = parseLine(line);
  return {
    food_number,
    food_group,
    name,
    search_key: fold(name),
    kcal: num(kcal),
    protein_g: num(protein),
    fat_g: num(fat),
    carbs_g: num(carbs),
  };
});

const sql = connect();
for (let i = 0; i < rows.length; i += 500) {
  const batch = rows.slice(i, i + 500);
  await sql`
    insert into reference_foods ${sql(batch)}
    on conflict (food_number) do update set
      food_group = excluded.food_group, name = excluded.name, search_key = excluded.search_key,
      kcal = excluded.kcal, protein_g = excluded.protein_g, fat_g = excluded.fat_g, carbs_g = excluded.carbs_g`;
}
await sql.end();
console.log(`  reference  ${rows.length} foods from MEXT 日本食品標準成分表 (八訂) 増補2023`);
