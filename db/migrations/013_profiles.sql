/*
 * What a maintenance estimate starts from (healthspec.md §6.3): each
 * person's height, age and sex for the formula's first guess, how active
 * they are outside of runs, and the rate of change they are aiming for.
 * Weight is not here; it comes from the weigh-ins.
 */
create table if not exists profiles (
  user_id      integer primary key references users(id) on delete cascade,
  height_cm    double precision check (height_cm is null or height_cm between 100 and 230),
  birth_year   integer check (birth_year is null or birth_year between 1920 and 2020),
  sex          text check (sex is null or sex in ('male', 'female')),
  -- Maintenance as a multiple of resting burn, runs aside.
  activity     double precision not null default 1.5 check (activity between 1.2 and 2.2),
  -- Signed: +0.15 is a slow bulk, -0.4 a steady cut, 0 holds.
  goal_kg_week double precision not null default 0 check (goal_kg_week between -1 and 1),
  updated_at   timestamptz not null default now()
);

-- Bear's, as given on 2026-11-15: 5'8", 38, a slow bulk. Bunny's are entered in Settings.
insert into profiles (user_id, height_cm, birth_year, sex, activity, goal_kg_week)
select id, 172.7, 1988, 'male', 1.5, 0.15 from users where slug = 'bear'
on conflict (user_id) do nothing;
