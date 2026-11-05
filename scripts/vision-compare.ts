/**
 * Scores each vision model against what reviewers confirmed (healthspec.md §9).
 *
 *   bun run vision:compare            # writes docs/vision-comparison.md
 *
 * Ground truth is `foods.reading`, the label as the reviewer confirmed it was
 * printed. Every field a model got different from that is a misread. Only
 * printed fields count (see PRINTED_FIELDS): the English name and a meat
 * pack's per-100g estimate are judgement, so they are reported apart rather
 * than mixed into the reading score.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { connect } from "./sql.mjs";
import { PRINTED_FIELDS, sameValue, type Reading } from "../src/lib/health/reading";

type Row = {
  food_id: number;
  model: string;
  served_by: string | null;
  output: Reading | null;
  error: string | null;
  latency_ms: number | null;
  truth: Reading;
};

const sql = connect();
const rows = (await sql`
  select r.food_id, r.model, r.served_by, r.output, r.error, r.latency_ms, f.reading as truth
  from food_readings r join foods f on f.id = r.food_id
  where f.status = 'confirmed' and f.reading is not null
    -- A chat's own submission is the original, not a vision model's guess at it.
    and r.model not like 'chat:%'
  order by r.food_id, r.model`) as unknown as Row[];
await sql.end();

type Score = {
  foods: number;
  failed: number;
  /** Never attempted because the account had no credit: not the model's failure. */
  unbilled: number;
  perfect: number;
  misreads: number;
  byField: Map<string, number>;
  estimateOff: number[];
  latencies: number[];
  fellBack: number;
};

const models = new Map<string, Score>();
const fresh = (): Score => ({
  foods: 0, failed: 0, unbilled: 0, perfect: 0, misreads: 0, byField: new Map(), estimateOff: [], latencies: [], fellBack: 0,
});

for (const row of rows) {
  const s = models.get(row.model) ?? fresh();
  models.set(row.model, s);
  // Gemini's credit can take a day to land; reads refused for it say nothing about the model.
  if (!row.output && row.error && /out of credit/i.test(row.error)) {
    s.unbilled += 1;
    continue;
  }
  s.foods += 1;
  if (!row.output) {
    s.failed += 1;
    continue;
  }
  if (row.latency_ms) s.latencies.push(row.latency_ms);
  if (row.served_by && row.served_by !== row.model) s.fellBack += 1;

  const wrong = PRINTED_FIELDS.filter((f) => !sameValue(row.output![f], row.truth[f]));
  if (!wrong.length) s.perfect += 1;
  s.misreads += wrong.length;
  for (const f of wrong) s.byField.set(f, (s.byField.get(f) ?? 0) + 1);

  const est = row.output.estimate_per_100g;
  const truthEst = row.truth.estimate_per_100g;
  if (row.truth.kind === "meat_fish_pack" && est && truthEst && truthEst.kcal > 0) {
    s.estimateOff.push(Math.abs(est.kcal - truthEst.kcal) / truthEst.kcal);
  }
}

const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : "–");
const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

const names = [...models.keys()];
const lines: string[] = [];
lines.push("# Vision model comparison", "");
lines.push(
  `Generated ${new Date().toISOString().slice(0, 10)} by \`bun run vision:compare\` from ` +
    `${new Set(rows.map((r) => r.food_id)).size} reviewed foods. Ground truth is what the reviewer ` +
    "confirmed was printed; a misread is any printed field a model got different from that.",
  "",
);
lines.push(`| | ${names.join(" | ")} |`, `|---|${names.map(() => "---").join("|")}|`);
const row = (label: string, f: (s: Score) => string) =>
  lines.push(`| ${label} | ${names.map((m) => f(models.get(m)!)).join(" | ")} |`);
row("Foods read", (s) => String(s.foods));
row("Failed to read", (s) => String(s.failed));
row("Not read: account out of credit", (s) => String(s.unbilled));
row("Read with no misreads", (s) => `${s.perfect} (${pct(s.perfect, s.foods - s.failed)})`);
row("Misread fields, total", (s) => String(s.misreads));
for (const field of PRINTED_FIELDS) row(`… ${field}`, (s) => String(s.byField.get(field) ?? 0));
row("Meat/fish kcal estimate, median off", (s) => {
  const m = median(s.estimateOff);
  return m === null ? "–" : `${Math.round(m * 100)}%`;
});
row("Median latency", (s) => {
  const m = median(s.latencies);
  return m === null ? "–" : `${(m / 1000).toFixed(1)}s`;
});
row("Served by a fallback model", (s) => String(s.fellBack));

await mkdir("docs", { recursive: true });
await writeFile("docs/vision-comparison.md", lines.join("\n") + "\n");
console.log(lines.join("\n"));
