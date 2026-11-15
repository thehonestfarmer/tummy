/*
 * Training (healthspec.md §7). Plans come from Claude over MCP; sessions and
 * sets are logged in the app. Everything a screen shows about progress (the
 * next routine, the suggested load, whether someone trained today) is
 * derived from these rows on read, never stored.
 */

/*
 * One list of exercises for both of us (§7.2). `equipment` says how a load
 * is counted: a dumbbell or kettlebell load is per hand, a bodyweight load is
 * the weight added, everything else is the total including the bar.
 */
create table if not exists exercises (
  id         serial primary key,
  name       text not null,
  aliases    text[] not null default '{}',
  kind       text not null default 'load_reps' check (kind in ('load_reps', 'time', 'distance', 'rounds')),
  equipment  text not null default 'other'
             check (equipment in ('barbell', 'dumbbell', 'kettlebell', 'machine', 'bodyweight', 'other')),
  created_by integer references users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists exercises_name_idx on exercises (lower(name));

/*
 * A routine is a plan with no date and a place in its owner's rotation. A
 * dated plan is for one day, overrides the rotation that day, and may name
 * the routine it stands in for so the rotation moves on (§7.1).
 *
 * Replacing a routine rewrites its blocks and keeps this row, so sessions
 * that used it still point at it. Removing one archives it for the same
 * reason.
 */
create table if not exists plans (
  id            serial primary key,
  user_id       integer not null references users(id) on delete cascade,
  name          text not null,
  notes         text,
  date          date,
  position      integer,
  stands_in_for integer references plans(id) on delete set null,
  archived_at   timestamptz,
  created_by    integer references users(id) on delete set null,
  client        text not null default 'pwa' check (client in ('pwa', 'claude', 'chatgpt')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create unique index if not exists plans_routine_name_idx on plans (user_id, lower(name)) where date is null and archived_at is null;
create unique index if not exists plans_date_idx on plans (user_id, date) where date is not null;

create table if not exists plan_blocks (
  id       serial primary key,
  plan_id  integer not null references plans(id) on delete cascade,
  position integer not null,
  label    text,
  kind     text not null default 'straight'
           check (kind in ('straight', 'superset', 'emom', 'intervals', 'finisher', 'other'))
);

create index if not exists plan_blocks_plan_idx on plan_blocks (plan_id, position);

create table if not exists plan_exercises (
  id            serial primary key,
  block_id      integer not null references plan_blocks(id) on delete cascade,
  position      integer not null,
  exercise_id   integer not null references exercises(id),
  -- As Claude wrote it, so nothing is lost in structuring.
  prescription  text not null,
  target_sets   integer check (target_sets is null or target_sets > 0),
  rep_min       integer check (rep_min is null or rep_min > 0),
  rep_max       integer check (rep_max is null or rep_max >= rep_min),
  target_rir    double precision check (target_rir is null or target_rir >= 0),
  start_load_kg double precision check (start_load_kg is null or start_load_kg >= 0),
  -- The smallest jump the gym can load for this exercise (§7.5).
  step_kg       double precision not null default 2.5 check (step_kg > 0)
);

create index if not exists plan_exercises_block_idx on plan_exercises (block_id, position);

/*
 * A session belongs to both of us (§7.4): one starts it, the other may join,
 * and each follows their own plan in it. At most one is open at a time.
 */
create table if not exists sessions (
  id         serial primary key,
  date       date not null,
  started_by integer references users(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at   timestamptz
);

create unique index if not exists one_open_session on sessions ((true)) where ended_at is null;
create index if not exists sessions_date_idx on sessions (date);

create table if not exists session_people (
  session_id  integer not null references sessions(id) on delete cascade,
  user_id     integer not null references users(id) on delete cascade,
  -- Null for a session started with no plan.
  plan_id     integer references plans(id) on delete set null,
  joined_at   timestamptz not null default now(),
  finished_at timestamptz,
  rating      integer check (rating is null or rating between 0 and 10),
  note        text,
  primary key (session_id, user_id)
);

create index if not exists session_people_user_idx on session_people (user_id, joined_at desc);

/*
 * One set (§7.3). Which columns are filled depends on `kind`. `per_hand` is
 * copied from the exercise when the set is logged, so a later change to the
 * exercise doesn't reinterpret old loads.
 */
create table if not exists sets (
  id          serial primary key,
  session_id  integer not null references sessions(id) on delete cascade,
  user_id     integer not null references users(id) on delete cascade,
  exercise_id integer not null references exercises(id),
  set_order   integer not null,
  kind        text not null check (kind in ('load_reps', 'time', 'distance', 'rounds')),
  warmup      boolean not null default false,
  load_kg     double precision check (load_kg is null or load_kg >= 0),
  per_hand    boolean not null default false,
  reps        integer check (reps is null or reps >= 0),
  rir         double precision check (rir is null or rir >= 0),
  seconds     double precision check (seconds is null or seconds >= 0),
  meters      double precision check (meters is null or meters >= 0),
  rounds      double precision check (rounds is null or rounds >= 0),
  rating      integer check (rating is null or rating between 0 and 10),
  source      text not null default 'touch' check (source in ('touch', 'voice', 'mcp')),
  client      text not null default 'pwa' check (client in ('pwa', 'claude', 'chatgpt')),
  input_text  text,
  logged_at   timestamptz not null default now()
);

create index if not exists sets_session_idx on sets (session_id, user_id, set_order);
create index if not exists sets_history_idx on sets (user_id, exercise_id, logged_at desc);
