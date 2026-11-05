/**
 * Turns MEXT's 日本食品標準成分表 (八訂) Excel file into the trimmed CSV that is
 * committed under db/reference/ and loaded by `bun run seed:reference`
 * (healthspec.md §5.8). Run it only when MEXT publishes an update:
 *
 *   curl -L -o /tmp/mext.xlsx <the 第2章（データ） link on the MEXT page>
 *   bun scripts/reference-csv.ts /tmp/mext.xlsx
 *
 * Only the columns the app uses are kept: the food number, its group, its
 * Japanese name, and energy, protein, fat and total carbohydrate per 100g.
 * Total 炭水化物 (CHOCDF-) rather than available carbohydrate, because that is
 * what labels print and what the targets are written in.
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";

const source = process.argv[2];
if (!source) throw new Error("usage: bun scripts/reference-csv.ts <mext.xlsx>");

const wb = XLSX.read(readFileSync(source));
const sheet = wb.Sheets["表全体"] ?? wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json<(string | null)[]>(sheet, { header: 1, raw: false, defval: null });

// Columns are found by MEXT's component identifiers rather than by position,
// so a reordered sheet fails loudly instead of loading the wrong numbers.
const idRow = rows.find((r) => r.includes("ENERC_KCAL"));
if (!idRow) throw new Error("no component-identifier row (ENERC_KCAL) found");
const col = (id: string) => {
  const i = idRow.indexOf(id);
  if (i < 0) throw new Error(`column ${id} not found`);
  return i;
};
const KCAL = col("ENERC_KCAL");
const PROT = col("PROT-");
const FAT = col("FAT-");
const CARB = col("CHOCDF-");

/**
 * The table's notation: Tr is a trace, so 0; "-" was not measured, so null;
 * parentheses mark an estimate or a borrowed value, which is still the best
 * figure there is; "*" and blanks are empty.
 */
function value(raw: string | null): number | null {
  if (raw === null) return null;
  const s = raw.trim().replace(/^\((.*)\)$/, "$1");
  if (s === "Tr") return 0;
  if (s === "" || s === "-" || s === "*") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const csv = (v: string | number | null) => {
  if (v === null) return "";
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const out = ["food_number,food_group,name,kcal,protein_g,fat_g,carbs_g"];
for (const r of rows) {
  const number = r[1];
  if (!number || !/^\d{5}$/.test(number)) continue;
  const name = (r[3] ?? "").replace(/\s+/g, " ").replace(/　+/g, " ").trim();
  out.push([number, r[0], name, value(r[KCAL]), value(r[PROT]), value(r[FAT]), value(r[CARB])].map(csv).join(","));
}

writeFileSync("db/reference/mext-2023.csv", out.join("\n") + "\n");
console.log(`wrote ${out.length - 1} foods to db/reference/mext-2023.csv`);
