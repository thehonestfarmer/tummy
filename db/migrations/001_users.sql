/*
 * The two of us. The same PINs as the photo app, seeded by scripts/seed.mjs
 * from BUNNY_PIN and BEAR_PIN (healthspec.md §3). `pin_hash` is an HMAC under
 * SESSION_SECRET, deterministic so it can carry a uniqueness constraint.
 *
 * `api_token` is each person's secret for the MCP connector (mcpspec.md §12).
 * The secret is the whole credential and also says who is calling, so no
 * tool takes a user argument. Stored as is rather than hashed, so the Connect
 * screen can show it again when a second device needs setting up: two private
 * users, and security here is deliberately light.
 */
create table if not exists users (
  id           serial primary key,
  slug         text not null unique check (slug in ('bunny','bear')),
  display_name text not null,
  pin_hash     text not null unique,
  api_token    text unique,
  created_at   timestamptz not null default now()
);
