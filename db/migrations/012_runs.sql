/*
 * Runs (healthspec.md §7.6). Read off a Strava screenshot, in a chat or in
 * the app, or typed. A run's calories are added to that day's target, so
 * what is stored is the number that was used: Strava's own when the
 * screenshot showed it, an estimate from body weight and distance when not.
 */
create table if not exists runs (
  id          serial primary key,
  user_id     integer not null references users(id) on delete cascade,
  local_date  date not null,
  distance_km double precision not null check (distance_km > 0 and distance_km <= 500),
  seconds     integer check (seconds is null or seconds > 0),
  kcal        integer not null check (kcal >= 0 and kcal <= 20000),
  kcal_from   text not null check (kcal_from in ('strava', 'estimate')),
  name        text,
  source      text not null default 'touch' check (source in ('touch', 'screenshot', 'mcp')),
  client      text not null default 'pwa' check (client in ('pwa', 'claude', 'chatgpt')),
  entered_by  integer references users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- The same screenshot shared twice is one run.
create unique index if not exists runs_once_idx on runs (user_id, local_date, distance_km, coalesce(seconds, 0));
create index if not exists runs_day_idx on runs (user_id, local_date);
