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

await sql.end();
console.log("seed complete");
