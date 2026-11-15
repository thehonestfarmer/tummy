/*
 * Waist measurements (healthspec.md §6.2): one a week, in centimetres, each
 * person's own. For someone gaining muscle while losing fat the scale can
 * stand still, and the tape is what shows the change.
 */
create table if not exists waist_measures (
  id         serial primary key,
  user_id    integer not null references users(id) on delete cascade,
  local_date date not null,
  waist_cm   double precision not null check (waist_cm between 40 and 200),
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

-- The weight the formula uses until there is a weigh-in to go on.
alter table profiles add column if not exists weight_kg double precision check (weight_kg is null or weight_kg between 20 and 400);

-- Bunny's, as given on 2026-11-15: 5'4", 62 kg, 28, new to lifting, so a small deficit to lose fat while gaining muscle.
insert into profiles (user_id, height_cm, birth_year, sex, activity, goal_kg_week, weight_kg)
select id, 162.6, 1998, 'female', 1.5, -0.25, 62 from users where slug = 'bunny'
on conflict (user_id) do nothing;

update profiles set weight_kg = 72.5
where weight_kg is null and user_id = (select id from users where slug = 'bear');
