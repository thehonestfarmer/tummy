/*
 * Cooking (healthspec.md §5.12): several foods go into a pot and come out as
 * one dish, which sits in the fridge and is eaten in portions.
 *
 * The dish is an ordinary food, source `recipe`, with one serving called
 * "portion". Its per-100g values are the ingredients' totals over the dish's
 * weight: the weighed pot when someone weighed it, the raw weights added up
 * when nobody did.
 *
 * The ingredients leave the fridge without being eaten: a `cooked` change
 * takes its grams away and stops at nothing, exactly as a log entry does.
 */
alter table foods drop constraint if exists foods_source_check;
alter table foods add constraint foods_source_check
  check (source in ('label_ocr', 'pack_read', 'reference_table', 'llm_estimate', 'manual', 'recipe'));

alter table fridge_changes drop constraint if exists fridge_changes_kind_check;
alter table fridge_changes add constraint fridge_changes_kind_check
  check (kind in ('stocked', 'set', 'finished', 'discarded', 'cooked'));

/*
 * Every time a dish was cooked, and what went in. Kept so the same dish can
 * be cooked again from its last list, and so its numbers can be traced.
 */
create table if not exists cooks (
  id           serial primary key,
  food_id      integer not null references foods(id) on delete cascade,
  portions     double precision not null check (portions > 0),
  -- Null when the finished dish wasn't weighed.
  cooked_grams double precision check (cooked_grams is null or cooked_grams > 0),
  user_id      integer references users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists cooks_food_idx on cooks (food_id, created_at);

create table if not exists cook_items (
  id       serial primary key,
  cook_id  integer not null references cooks(id) on delete cascade,
  food_id  integer not null references foods(id) on delete cascade,
  grams    double precision not null check (grams > 0),
  position integer not null default 0
);

create index if not exists cook_items_cook_idx on cook_items (cook_id, position);
