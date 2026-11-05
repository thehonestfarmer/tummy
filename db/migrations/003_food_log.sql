/*
 * Calorie and macro targets (healthspec.md §6.1). The target for a day is
 * the latest active row whose effective date is on or before it, so changing
 * a target never rewrites a day that has already happened.
 */
create table if not exists targets (
  id             serial primary key,
  user_id        integer not null references users(id) on delete cascade,
  effective_date date not null,
  kcal           double precision not null check (kcal > 0),
  protein_g      double precision not null check (protein_g >= 0),
  fat_g          double precision not null check (fat_g >= 0),
  carbs_g        double precision not null check (carbs_g >= 0),
  status         text not null default 'active' check (status in ('active', 'proposed', 'dismissed')),
  reason         text,
  created_at     timestamptz not null default now()
);

create index if not exists targets_user_idx on targets (user_id, effective_date desc);

-- The starting targets (§13) are inserted by scripts/seed.mjs, after the users exist.

/*
 * One meal split between both of us (§5.7): two entries, one in each
 * person's day, tied together so either half can be found from the other.
 * Each half is still its owner's to edit or delete.
 */
create table if not exists shared_meals (
  id         serial primary key,
  created_by integer references users(id) on delete set null,
  created_at timestamptz not null default now()
);

/*
 * What each of us ate (§5.4). An entry carries a snapshot of the food's name
 * and per-100g values at the moment it was logged, so editing a food in the
 * library corrects what is logged next and never rewrites what was eaten.
 * Totals are derived from grams × snapshot on read; nothing is summed and
 * stored.
 *
 * Entries are editable and deletable: logs need correcting (§11).
 *
 * `local_date` is the day in the phone's own time zone at logging (§4),
 * stored rather than derived so a late-night entry can be moved to the day
 * it belongs to.
 */
create table if not exists food_entries (
  id           serial primary key,
  user_id      integer not null references users(id) on delete cascade,
  food_id      integer references foods(id) on delete set null,
  grams        double precision not null check (grams > 0),
  name         text not null,
  kcal_100g    double precision not null,
  protein_100g double precision not null,
  fat_100g     double precision not null,
  carbs_100g   double precision not null,
  logged_at    timestamptz not null default now(),
  tz           text not null,
  local_date   date not null,
  source       text not null check (source in ('touch', 'voice', 'mcp')),
  -- The app, or which assistant (mcpspec.md §2).
  client       text not null default 'pwa' check (client in ('pwa', 'claude', 'chatgpt')),
  -- What was said or typed, for entries that came from words.
  input_text   text,
  -- Who logged it, which differs from user_id for the partner's half of a shared meal.
  created_by   integer references users(id) on delete set null,
  shared_meal_id integer references shared_meals(id) on delete set null,
  created_at   timestamptz not null default now()
);

create index if not exists food_entries_day_idx on food_entries (user_id, local_date);
create index if not exists food_entries_food_idx on food_entries (food_id, user_id, logged_at desc);

/*
 * A log waiting on a food that is still a draft: "apple, 180 grams" the
 * first time, before anyone has confirmed what an apple is (§5.2). It becomes
 * a real entry when the draft is confirmed, and disappears with the draft if
 * the draft is discarded.
 */
create table if not exists pending_logs (
  id         serial primary key,
  food_id    integer not null references foods(id) on delete cascade,
  user_id    integer not null references users(id) on delete cascade,
  -- Null means "the food's default amount", decided once the food exists.
  grams      double precision check (grams is null or grams > 0),
  logged_at  timestamptz not null default now(),
  tz         text not null,
  local_date date not null,
  source     text not null check (source in ('touch', 'voice', 'mcp')),
  client     text not null default 'pwa' check (client in ('pwa', 'claude', 'chatgpt')),
  input_text text,
  created_by integer references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists pending_logs_food_idx on pending_logs (food_id);
