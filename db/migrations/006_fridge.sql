/*
 * The fridge (healthspec.md §5.10): what is in the house now, for both of us.
 *
 * A ledger of what was put in and of corrections, never edited. What is left
 * of a food is not stored: it is worked out on read by walking these rows and
 * the log entries for the same food in time order, so editing or deleting an
 * entry corrects the fridge with no second write.
 *
 *   stocked    grams were added (after shopping)
 *   set        the amount is now exactly `grams` (a correction)
 *   finished   there is none left
 *   discarded  there is none left, and it was thrown out, not eaten
 */
create table if not exists fridge_changes (
  id         serial primary key,
  food_id    integer not null references foods(id) on delete cascade,
  kind       text not null check (kind in ('stocked', 'set', 'finished', 'discarded')),
  grams      double precision not null default 0 check (grams >= 0),
  user_id    integer references users(id) on delete set null,
  client     text not null default 'pwa' check (client in ('pwa', 'claude', 'chatgpt')),
  created_at timestamptz not null default now()
);

create index if not exists fridge_changes_food_idx on fridge_changes (food_id, created_at);

/*
 * A draft's reading now lands in two steps, so the person scanning a label
 * sees the values as soon as they are read: first the reading, then the
 * food-table row it is checked against. `reference_done` is false between
 * the two. Rows that predate this, and drafts that never go through a
 * reading (those submitted from a chat), are done by definition.
 */
alter table foods add column if not exists reference_done boolean not null default true;
