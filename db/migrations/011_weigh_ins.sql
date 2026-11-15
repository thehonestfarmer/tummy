/*
 * Weigh-ins (healthspec.md §6.2): one per person per day, in kilograms,
 * entered by that person. The 7-day average and its change are worked out
 * on read.
 */
create table if not exists weigh_ins (
  id         serial primary key,
  user_id    integer not null references users(id) on delete cascade,
  local_date date not null,
  weight_kg  double precision not null check (weight_kg between 20 and 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, local_date)
);
