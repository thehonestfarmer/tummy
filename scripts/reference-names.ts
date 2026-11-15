/**
 * Writes the migration that makes MEXT's food table searchable by what we
 * type (healthspec.md §5.8): English ("sweet potato"), romaji ("satsumaimo")
 * as well as Japanese. The table itself is Japanese only.
 *
 *   bun scripts/reference-names.ts [english.xlsx]
 *
 * English names come from two files under db/reference/:
 *
 * - `mext-names-en.tsv`: MEXT's own English names, from the English edition
 *   of the 2015 table (the newest one published as a spreadsheet). Given the
 *   xlsx, this file is rewritten from it first.
 * - `mext-names-en-extra.tsv`: our own translations, in the same style, of
 *   the rows added since 2015, and at the end a few corrections where the
 *   2015 file names a different row than the Japanese does. Not official;
 *   these win over the file above.
 *
 * The names go in a migration rather than through `seed:reference` so that
 * they reach production with a push, like everything else.
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as XLSX from "xlsx";
import { fold } from "../src/lib/health/fold";

const OFFICIAL = "db/reference/mext-names-en.tsv";
const EXTRA = "db/reference/mext-names-en-extra.tsv";
const OUT = "db/migrations/010_reference_names.sql";

const source = process.argv[2];
if (source) {
  const wb = XLSX.read(readFileSync(source));
  const rows = XLSX.utils.sheet_to_json<(string | null)[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: null });
  const lines = rows
    .filter((r) => /^\d{5}$/.test(String(r[1] ?? "").trim()) && r[3])
    .map((r) => `${String(r[1]).trim()}\t${String(r[3]).replace(/\s+/g, " ").trim()}`);
  writeFileSync(OFFICIAL, lines.join("\n") + "\n");
  console.log(`  wrote ${OFFICIAL} (${lines.length} names)`);
}

const tsv = (file: string) =>
  new Map(
    readFileSync(file, "utf8")
      .trim()
      .split("\n")
      .map((l) => l.split("\t") as [string, string]),
  );
const english = new Map([...tsv(OFFICIAL), ...tsv(EXTRA)]);

const KANA: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko", が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so", ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to", だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho", ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo", や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro", わ: "wa", を: "o", ん: "n", ゔ: "vu",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
};
const SMALL: Record<string, string> = { ゃ: "ya", ゅ: "yu", ょ: "yo" };

/** Hepburn romaji for a run of hiragana; anything else (kanji, digits) is dropped. */
function romaji(kana: string): string {
  let out = "";
  let double = false;
  for (let i = 0; i < kana.length; i++) {
    const c = kana[i];
    if (c === "っ") {
      double = true;
      continue;
    }
    let s = KANA[c];
    if (!s) {
      double = false;
      continue;
    }
    const small = SMALL[kana[i + 1]];
    if (small && s.endsWith("i")) {
      // きゃ → kya, しゃ → sha, じゅ → ju
      s = /^(sh|ch|j)/.test(s) ? s.slice(0, -1) + small.slice(1) : s.slice(0, -1) + small;
      i++;
    }
    out += double ? s[0] + s : s;
    double = false;
  }
  return out;
}

/** とうふ is typed "tofu" as often as "toufu". */
const short = (r: string) => r.replace(/ou|oo/g, "o").replace(/uu/g, "u");

/** The Japanese name without the table's group headings: ＜いも類＞ （さつまいも類） さつまいも … */
const plain = (name: string) =>
  name
    .replace(/＜[^＞]*＞/g, " ")
    .trim()
    .replace(/^(（[^）]*）\s*)+/, "")
    .replace(/\s+/g, " ")
    .trim();

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

const q = (s: string | null) => (s === null ? "null" : `'${s.replace(/'/g, "''")}'`);

const table = readFileSync("db/reference/mext-2023.csv", "utf8").trim().split("\n").slice(1).map(parseLine);
let named = 0;
const values = table.map(([number, , name]) => {
  const raw = english.get(number) ?? null;
  // "Common oats*, oatmeal, raw ［*Syn. Oats］": the synonym is searched, not shown.
  const shown = raw ? raw.replace(/［.*$/, "").replace(/\*/g, "").replace(/\s+/g, " ").replace(/\s+,/g, ",").trim() : null;
  if (shown) named++;
  const ja = plain(name);
  const spoken = ja
    .split(" ")
    .map((word) => romaji(fold(word)))
    .filter((r) => r.length >= 2);
  const search = [
    (raw ?? "").toLowerCase().replace(/syn\./g, " ").replace(/[^a-z0-9]+/g, " "),
    ...spoken,
    ...spoken.map(short),
  ]
    .join(" ")
    .split(" ")
    .filter((w, i, all) => w && all.indexOf(w) === i)
    .join(" ");
  return `(${q(number)}, ${q(shown)}, ${q(ja)}, ${q(search)})`;
});

writeFileSync(
  OUT,
  `/*
 * English and romaji names for MEXT's food table, so it can be searched by
 * what we type (healthspec.md §5.8). Written by scripts/reference-names.ts;
 * change the files it reads and run it again rather than editing this.
 *
 * Kept apart from \`reference_foods\`, which is loaded by seed:reference, so
 * the two can arrive in either order. \`name_en\` is MEXT's own English name
 * where it published one and our translation where it didn't; it is null
 * only for a row added to the table after this file was written.
 */
create table if not exists reference_names (
  food_number text primary key,
  name_en     text,
  -- The Japanese name without the table's group headings.
  name_ja     text not null,
  -- Lowercase words: the English name and its synonyms, then the Japanese name in romaji.
  search      text not null
);

insert into reference_names (food_number, name_en, name_ja, search) values
${values.join(",\n")}
on conflict (food_number) do update set
  name_en = excluded.name_en, name_ja = excluded.name_ja, search = excluded.search;
`,
);
console.log(`  wrote ${OUT} (${table.length} rows, ${named} with an English name)`);
