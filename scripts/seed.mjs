import { createHmac } from "node:crypto";
import { loadEnv } from "./env.mjs";
import { connect } from "./sql.mjs";

// Explicit: the PINs are validated before we open a connection, so the env has
// to be in place first rather than arriving as a side effect of connect().
loadEnv();
const { SESSION_SECRET, BUNNY_PIN, BEAR_PIN } = process.env;
const pinHash = (pin) => createHmac("sha256", SESSION_SECRET).update(pin).digest("hex");

for (const [name, pin] of [["BUNNY_PIN", BUNNY_PIN], ["BEAR_PIN", BEAR_PIN]]) {
  if (!/^\d{4}$/.test(pin ?? "")) throw new Error(`${name} must be exactly 4 digits`);
}
// A PIN collision makes the app unusable: the second user could never sign in.
if (BUNNY_PIN === BEAR_PIN) throw new Error("BUNNY_PIN and BEAR_PIN must differ");

const sql = connect();

for (const [slug, displayName, pin] of [
  ["bunny", "Bunny", BUNNY_PIN],
  ["bear", "Bear", BEAR_PIN],
]) {
  await sql`
    insert into users (slug, display_name, pin_hash)
    values (${slug}, ${displayName}, ${pinHash(pin)})
    on conflict (slug) do update set pin_hash = excluded.pin_hash,
                                     display_name = excluded.display_name`;
  console.log(`  user  ${displayName} (pin ${pin})`);
}

/*
 * The starting targets agreed on 2026-10-28 (healthspec.md §13). Only for a
 * person with no targets yet, so rerunning is harmless and a later approved
 * target is never disturbed.
 */
const added = await sql`
  insert into targets (user_id, effective_date, kcal, protein_g, fat_g, carbs_g, reason)
  select u.id, date '2026-10-28', t.kcal, t.protein_g, t.fat_g, t.carbs_g, 'Starting target'
  from users u
  join (values ('bear', 2825, 130, 75, 405), ('bunny', 1700, 125, 50, 185))
    as t (slug, kcal, protein_g, fat_g, carbs_g) on t.slug = u.slug
  where not exists (select 1 from targets x where x.user_id = u.id)
  returning user_id`;
console.log(`  targets  ${added.length} starting target(s) added`);

/*
 * Starting guidance (mcpspec.md §7), from the summary there of the Oct 2026
 * targets doc and the training notes. Only where a section is still empty,
 * so edits made since, by either of you or by Claude, are never overwritten.
 * Bear reviews these before launch.
 */
const SAME_DAY =
  "Same target every day, including the 20K-step day: on that day, an optional +200–250 kcal, protein-led, " +
  "if hunger is high.";
const GUIDANCE = {
  bear: {
    standing_rules: `${SAME_DAY} Protein first. Gaining slowly: a surplus of about +250 kcal a day. Fat floor about 45g.`,
    weight: "Daily weigh-ins; judge by the 7-day average. Expect water swings from sodium, soreness, and fasting.",
    training:
      "Check the back traffic light each morning. If it isn't green, swap loaded hinges for the plan's alternative.",
    tone: "Direct, numbers-first.",
  },
  bunny: {
    standing_rules:
      `${SAME_DAY} Protein first; in the deficit, cut carbs or fat, never protein. Losing about 0.4 kg a week ` +
      "(about −425 kcal a day). Fat floor about 45g.",
    weight:
      "Trend only. Never state a daily weight. Waist is measured weekly. Judge by the 7-day trend, and expect " +
      "water swings from sodium, soreness, and fasting.",
    training: "Double progression on dumbbell work; 2.5kg is the smallest jump.",
    tone: "Plain and encouraging; lead with what to do.",
  },
};
const SHARED = {
  fasting:
    "Hit full calories and protein inside the eating window. Break the fast with about 40g of protein, then the " +
    "main meal. Salt water during the fast.",
  safety_stops:
    "Dizziness, shakiness, lightheadedness, or a racing heart means eat now, whatever the plan. Hunger alone doesn't.",
};
let sections = 0;
for (const [slug, own] of Object.entries(GUIDANCE)) {
  for (const [section, body] of Object.entries({ ...own, ...SHARED })) {
    const rows = await sql`
      insert into guidance (user_id, section, body)
      select id, ${section}, ${body} from users where slug = ${slug}
      on conflict (user_id, section) do nothing
      returning section`;
    sections += rows.length;
  }
}
console.log(`  guidance  ${sections} section(s) added`);

await sql.end();
console.log("seed complete");
