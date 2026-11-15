import "server-only";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import type { Client } from "./client";
import { fold } from "./fold";
import { EQUIPMENT, EXERCISE_KINDS, getRoutines, listExercises, plansById, type ExerciseView, type PlanView } from "./plans";

/*
 * The session (healthspec.md §7.4) and progression (§7.5). A session belongs
 * to both of us; each follows their own plan in it and sees only their own
 * sets. Whether someone trained today, which exercise is next and what load
 * to try are all worked out from the sets on read.
 */

export type SetView = {
  id: number;
  order: number;
  kind: ExerciseView["kind"];
  warmup: boolean;
  loadKg: number | null;
  perHand: boolean;
  reps: number | null;
  rir: number | null;
  seconds: number | null;
  meters: number | null;
  rounds: number | null;
  rating: number | null;
  at: string;
};

export type Suggestion = {
  loadKg: number | null;
  reps: number | null;
  seconds: number | null;
  meters: number | null;
  rounds: number | null;
  /** Why this load, when there is something to say: "up from 20", or that the dumbbells are full. */
  note: string | null;
};

export type WorkoutExercise = {
  exercise: ExerciseView;
  /** Null for an exercise added to the session, off-plan. */
  block: { index: number; label: string | null; kind: string } | null;
  prescription: string | null;
  targetSets: number | null;
  repMin: number | null;
  repMax: number | null;
  targetRir: number | null;
  stepKg: number;
  /** This session's sets, in order. */
  sets: SetView[];
  /** The working sets of the last session that had this exercise. */
  last: SetView[];
  lastDate: string | null;
  /** What the log button is filled with. */
  suggestion: Suggestion;
  /** Next time's load, when today's sets earned a step up. */
  goesUpTo: number | null;
};

export type SessionView = {
  id: number;
  date: string;
  open: boolean;
  planName: string | null;
  startedAt: string;
  /** Whether you have pressed Finish. */
  finished: boolean;
  rating: number | null;
  note: string | null;
  exercises: WorkoutExercise[];
  lastSetAt: string | null;
};

export type WorkoutView = {
  today: string;
  /** The open session you are in, or failing that the one you did today. */
  session: SessionView | null;
  /** Whether you have logged a set today (§7.4): the Start button gives way to "Trained". */
  trained: boolean;
  /** Your partner's open session, when you aren't in it yet. */
  joinable: { by: string; planName: string | null } | null;
  /** What Start workout offers: today's dated plan, else the rotation with the next one first. */
  choices: { id: number; name: string; dated: boolean; next: boolean; exercises: number }[];
};

/** A session nobody has touched for this long is over (§7.4). */
const STALE_HOURS = 3;

/** A pair of plate-loaded dumbbells holds at most this much per hand, handle included (§7.5). */
const DUMBBELL_MAX = 20;

type SetRow = {
  id: number;
  session_id: number;
  exercise_id: number;
  set_order: number;
  kind: ExerciseView["kind"];
  warmup: boolean;
  load_kg: number | null;
  per_hand: boolean;
  reps: number | null;
  rir: number | null;
  seconds: number | null;
  meters: number | null;
  rounds: number | null;
  rating: number | null;
  logged_at: Date;
  date: string;
};

const toSet = (r: SetRow): SetView => ({
  id: r.id,
  order: r.set_order,
  kind: r.kind,
  warmup: r.warmup,
  loadKg: r.load_kg,
  perHand: r.per_hand,
  reps: r.reps,
  rir: r.rir,
  seconds: r.seconds,
  meters: r.meters,
  rounds: r.rounds,
  rating: r.rating,
  at: r.logged_at.toISOString(),
});

type Line = {
  targetSets: number | null;
  repMin: number | null;
  repMax: number | null;
  startLoadKg: number | null;
  stepKg: number;
};

/** Whether a session's working sets earned the next step: every planned set at the top of the range (§7.5). */
function earned(sets: SetView[], line: Line): boolean {
  if (line.repMax === null || !sets.length) return false;
  const counted = sets.slice(0, line.targetSets ?? sets.length);
  if (line.targetSets !== null && counted.length < line.targetSets) return false;
  return counted.every((s) => (s.reps ?? 0) >= line.repMax! && (s.loadKg ?? 0) >= (sets[0].loadKg ?? 0));
}

/** The load after `load`, or null when it shouldn't climb: nothing added to a bodyweight exercise, or full dumbbells. */
function stepUp(load: number, exercise: ExerciseView, line: Line): number | null {
  if (exercise.equipment === "bodyweight" && load === 0) return null;
  const next = Math.round((load + line.stepKg) * 100) / 100;
  return exercise.equipment === "dumbbell" && next > DUMBBELL_MAX ? null : next;
}

const blank: Suggestion = { loadKg: null, reps: null, seconds: null, meters: null, rounds: null, note: null };

/**
 * What to try next (§7.5): the set just done, repeated; or last session's
 * load, one step heavier if it was earned; or the plan's start load. It only
 * ever climbs, and whatever is logged instead is what tomorrow follows from.
 */
function suggest(exercise: ExerciseView, line: Line, today: SetView[], last: SetView[]): Suggestion {
  const working = today.filter((s) => !s.warmup);
  const prev = working[working.length - 1] ?? today[today.length - 1];
  if (prev) return { ...blank, loadKg: prev.loadKg, reps: prev.reps, seconds: prev.seconds, meters: prev.meters, rounds: prev.rounds };

  if (exercise.kind !== "load_reps") {
    const was = last[0];
    return was ? { ...blank, loadKg: was.loadKg, seconds: was.seconds, meters: was.meters, rounds: was.rounds } : blank;
  }
  if (!last.length) {
    const empty = exercise.equipment === "barbell" ? 20 : exercise.equipment === "dumbbell" ? 2.5 : 0;
    return { ...blank, loadKg: line.startLoadKg ?? empty, reps: line.repMin ?? line.repMax ?? 8 };
  }
  const load = last[0].loadKg ?? 0;
  if (earned(last, line)) {
    const next = stepUp(load, exercise, line);
    if (next !== null) return { ...blank, loadKg: next, reps: line.repMin ?? last[0].reps, note: `up from ${load}` };
    if (exercise.equipment === "dumbbell") return { ...blank, loadKg: load, reps: last[0].reps, note: "the dumbbells are full: go for more reps" };
  }
  return { ...blank, loadKg: load, reps: last[0].reps };
}

/** Closes a session nobody has touched for three hours, so a forgotten Finish never blocks tomorrow. */
async function closeStale(): Promise<void> {
  await sql`
    update sessions s set ended_at = now()
    where s.ended_at is null
      and greatest(s.started_at, coalesce((select max(logged_at) from sets where session_id = s.id), s.started_at),
                   coalesce((select max(joined_at) from session_people where session_id = s.id), s.started_at))
          < now() - make_interval(hours => ${STALE_HOURS})`;
}

type SessionRow = { id: number; date: string; started_at: Date; ended_at: Date | null; started_by_name: string | null };
type PersonRow = { session_id: number; user_id: number; plan_id: number | null; finished_at: Date | null; rating: number | null; note: string | null };

/**
 * Everything the workout screen and the Start button need for one person.
 * `extra` names exercises the person has added on their screen but not yet
 * done a set of: they exist nowhere else until then (§7.4).
 */
export async function getWorkout(me: User, today: string, extra: number[] = []): Promise<WorkoutView> {
  await closeStale();
  const [sessions, routines] = await Promise.all([
    sql<SessionRow[]>`
      select s.id, to_char(s.date, 'YYYY-MM-DD') as date, s.started_at, s.ended_at, u.display_name as started_by_name
      from sessions s left join users u on u.id = s.started_by
      where s.ended_at is null or s.date = ${today}
      order by (s.ended_at is null) desc, s.started_at desc`,
    getRoutines(me, today),
  ]);
  const people = sessions.length
    ? await sql<PersonRow[]>`select session_id, user_id, plan_id, finished_at, rating, note from session_people where session_id = any(${sessions.map((s) => s.id)})`
    : [];
  const mine = (s: SessionRow) => people.find((p) => p.session_id === s.id && p.user_id === me.id);
  const open = sessions.find((s) => s.ended_at === null);
  const shown = (open && mine(open) ? open : undefined) ?? sessions.find((s) => s.ended_at !== null && mine(s));

  let joinable: WorkoutView["joinable"] = null;
  if (open && !mine(open)) {
    const starter = people.find((p) => p.session_id === open.id);
    const [plan] = starter?.plan_id ? await plansById([starter.plan_id]) : [];
    joinable = { by: open.started_by_name ?? "Your partner", planName: plan?.name ?? null };
  }

  const [{ trained }] = await sql<{ trained: boolean }[]>`
    select exists (
      select 1 from sets t join sessions s on s.id = t.session_id where t.user_id = ${me.id} and s.date = ${today}
    ) as trained`;

  const offered = routines.dated ? [routines.dated, ...routines.routines] : routines.routines;
  const choices = offered
    .map((p) => ({
      id: p.id,
      name: p.name,
      dated: p.date !== null,
      next: routines.dated ? p.date !== null : p.name === routines.next,
      exercises: p.blocks.reduce((n, b) => n + b.exercises.length, 0),
    }))
    .sort((a, b) => Number(b.next) - Number(a.next));

  if (!shown) return { today, session: null, trained, joinable, choices };

  const person = mine(shown)!;
  const [plan] = person.plan_id ? await plansById([person.plan_id]) : [];
  const session = await sessionView(me, shown, person, plan ?? null, shown.ended_at === null ? extra : []);
  return { today, session, trained, joinable, choices };
}

async function sessionView(me: User, s: SessionRow, person: PersonRow, plan: PlanView | null, extra: number[]): Promise<SessionView> {
  const todays = await sql<SetRow[]>`
    select t.*, to_char(s.date, 'YYYY-MM-DD') as date from sets t join sessions s on s.id = t.session_id
    where t.session_id = ${s.id} and t.user_id = ${me.id} order by t.set_order, t.id`;

  const planned = (plan?.blocks ?? []).flatMap((b, index) => b.exercises.map((e) => ({ ...e, block: { index, label: b.label, kind: b.kind } })));
  const plannedIds = new Set(planned.map((p) => p.exercise.id));
  // Off-plan exercises in the order they were first done, then any just added and not yet done.
  const addedIds = [...new Set([...todays.map((t) => t.exercise_id), ...extra])].filter((id) => !plannedIds.has(id));
  const added = addedIds.length ? (await listExercises()).filter((e) => addedIds.includes(e.id)) : [];
  const ids = [...plannedIds, ...addedIds];

  // The last session before this one that had each exercise: its working sets.
  const history = ids.length
    ? await sql<SetRow[]>`
        select t.*, to_char(s.date, 'YYYY-MM-DD') as date from sets t join sessions s on s.id = t.session_id
        where t.user_id = ${me.id} and t.exercise_id = any(${ids}) and t.session_id <> ${s.id} and not t.warmup
          and t.session_id = (
            select t2.session_id from sets t2
            where t2.user_id = ${me.id} and t2.exercise_id = t.exercise_id and t2.session_id <> ${s.id} and not t2.warmup
              and t2.logged_at < ${s.started_at}
            order by t2.logged_at desc limit 1)
        order by t.set_order, t.id`
    : [];

  const build = (exercise: ExerciseView, line: Line, rest: Pick<WorkoutExercise, "block" | "prescription" | "targetRir">): WorkoutExercise => {
    const sets = todays.filter((t) => t.exercise_id === exercise.id).map(toSet);
    const lastRows = history.filter((h) => h.exercise_id === exercise.id);
    const last = lastRows.map(toSet);
    const working = sets.filter((x) => !x.warmup);
    const up = exercise.kind === "load_reps" && earned(working, line) ? stepUp(working[0].loadKg ?? 0, exercise, line) : null;
    return {
      exercise,
      ...rest,
      targetSets: line.targetSets,
      repMin: line.repMin,
      repMax: line.repMax,
      stepKg: line.stepKg,
      sets,
      last,
      lastDate: lastRows[0]?.date ?? null,
      suggestion: suggest(exercise, line, sets, last),
      goesUpTo: up,
    };
  };

  const exercises = [
    ...planned.map((p) => build(p.exercise, p, { block: p.block, prescription: p.prescription, targetRir: p.targetRir })),
    ...addedIds.flatMap((id) => {
      const exercise = added.find((e) => e.id === id);
      const stepKg = exercise?.equipment === "bodyweight" ? 1.25 : 2.5;
      return exercise
        ? [build(exercise, { targetSets: null, repMin: null, repMax: null, startLoadKg: null, stepKg }, { block: null, prescription: null, targetRir: null })]
        : [];
    }),
  ];

  const lastSet = todays.reduce<Date | null>((m, t) => (!m || t.logged_at > m ? t.logged_at : m), null);
  return {
    id: s.id,
    date: s.date,
    open: s.ended_at === null,
    planName: plan?.name ?? null,
    startedAt: s.started_at.toISOString(),
    finished: person.finished_at !== null,
    rating: person.rating,
    note: person.note,
    exercises,
    lastSetAt: lastSet?.toISOString() ?? null,
  };
}

/**
 * Starts a workout, or joins the one your partner has open: there is only
 * ever one session at a time (§7.4). `planId` is one of your own plans, or
 * null for a session with no plan.
 */
export async function startWorkout(me: User, today: string, planId: number | null): Promise<void> {
  await closeStale();
  if (planId !== null) {
    const [plan] = await sql`select 1 from plans where id = ${planId} and user_id = ${me.id} and archived_at is null`;
    if (!plan) throw new Error("That plan isn't one of yours any more.");
  }
  await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(hashtext('tummy:session'))`;
    let [open] = await tx<{ id: number }[]>`select id from sessions where ended_at is null`;
    if (!open) [open] = await tx<{ id: number }[]>`insert into sessions (date, started_by) values (${today}, ${me.id}) returning id`;
    await tx`
      insert into session_people (session_id, user_id, plan_id) values (${open.id}, ${me.id}, ${planId})
      on conflict (session_id, user_id) do update set finished_at = null, plan_id = coalesce(session_people.plan_id, excluded.plan_id)`;
  });
}

async function openSession(me: User): Promise<number> {
  const [row] = await sql<{ id: number }[]>`
    select s.id from sessions s join session_people p on p.session_id = s.id and p.user_id = ${me.id} where s.ended_at is null`;
  if (!row) throw new Error("There's no workout open. Start one first.");
  return row.id;
}

const amount = (max: number) => z.number().min(0).max(max).nullable().optional();

export const SetInput = z.object({
  exerciseId: z.number().int(),
  warmup: z.boolean().optional(),
  loadKg: amount(1000),
  reps: z.number().int().min(0).max(1000).nullable().optional(),
  rir: amount(20),
  seconds: amount(36_000),
  meters: amount(100_000),
  rounds: amount(1000),
  rating: z.number().int().min(0).max(10).nullable().optional(),
});

export type SetInput = z.infer<typeof SetInput>;

/** Logs one set into the caller's open session. Its kind and how its load is counted come from the exercise. */
export async function logSet(
  me: User,
  raw: unknown,
  ctx: { source: "touch" | "voice" | "mcp"; client?: Client; inputText?: string },
): Promise<number> {
  const parsed = SetInput.safeParse(raw);
  if (!parsed.success) throw new Error("That set doesn't look right.");
  const p = parsed.data;
  const sessionId = await openSession(me);
  const [exercise] = await sql<{ id: number; kind: ExerciseView["kind"]; equipment: string }[]>`
    select id, kind, equipment from exercises where id = ${p.exerciseId}`;
  if (!exercise) throw new Error("That exercise isn't in the list.");
  const needs = { load_reps: p.reps, time: p.seconds, distance: p.meters, rounds: p.rounds }[exercise.kind];
  if (needs === null || needs === undefined) throw new Error("That set is missing its number.");
  const perHand = exercise.equipment === "dumbbell" || exercise.equipment === "kettlebell";
  const [{ id }] = await sql<{ id: number }[]>`
    insert into sets (session_id, user_id, exercise_id, set_order, kind, warmup, load_kg, per_hand, reps, rir, seconds, meters, rounds, rating,
                      source, client, input_text)
    values (${sessionId}, ${me.id}, ${exercise.id},
            (select coalesce(max(set_order), 0) + 1 from sets where session_id = ${sessionId} and user_id = ${me.id}),
            ${exercise.kind}, ${p.warmup ?? false}, ${p.loadKg ?? null}, ${perHand}, ${p.reps ?? null}, ${p.rir ?? null},
            ${p.seconds ?? null}, ${p.meters ?? null}, ${p.rounds ?? null}, ${p.rating ?? null},
            ${ctx.source}, ${ctx.client ?? "pwa"}, ${ctx.inputText ?? null})
    returning id`;
  // Logging again after Finish means it wasn't finished.
  await sql`update session_people set finished_at = null where session_id = ${sessionId} and user_id = ${me.id}`;
  return id;
}

const SetPatch = SetInput.omit({ exerciseId: true }).partial();

/** Corrects one of your own sets: any of its numbers, its reps in reserve, or whether it was a warm-up. */
export async function updateSet(me: User, id: number, raw: unknown): Promise<void> {
  const parsed = SetPatch.safeParse(raw);
  if (!parsed.success) throw new Error("That set doesn't look right.");
  const p = parsed.data;
  const has = (k: keyof typeof p) => p[k] !== undefined;
  const rows = await sql`
    update sets set
      warmup  = case when ${has("warmup")} then ${p.warmup ?? false} else warmup end,
      load_kg = case when ${has("loadKg")} then ${p.loadKg ?? null} else load_kg end,
      reps    = case when ${has("reps")} then ${p.reps ?? null} else reps end,
      rir     = case when ${has("rir")} then ${p.rir ?? null} else rir end,
      seconds = case when ${has("seconds")} then ${p.seconds ?? null} else seconds end,
      meters  = case when ${has("meters")} then ${p.meters ?? null} else meters end,
      rounds  = case when ${has("rounds")} then ${p.rounds ?? null} else rounds end,
      rating  = case when ${has("rating")} then ${p.rating ?? null} else rating end
    where id = ${id} and user_id = ${me.id} returning id`;
  if (!rows.length) throw new Error("That set is gone.");
}

export async function deleteSet(me: User, id: number): Promise<void> {
  await sql`delete from sets where id = ${id} and user_id = ${me.id}`;
}

/**
 * Your Finish (§7.4): a rating and a note, and the session closes once
 * everyone in it has finished. A session nobody logged a set in was a
 * mis-tap, and leaves nothing behind.
 */
export async function finishWorkout(me: User, raw: unknown): Promise<void> {
  const parsed = z.object({ rating: z.number().int().min(0).max(10).nullable().optional(), note: z.string().trim().max(1000).nullable().optional() }).safeParse(raw);
  if (!parsed.success) throw new Error("A rating is a number from 0 to 10.");
  const sessionId = await openSession(me);
  await sql.begin(async (tx) => {
    await tx`
      update session_people set finished_at = now(), rating = ${parsed.data.rating ?? null}, note = ${parsed.data.note || null}
      where session_id = ${sessionId} and user_id = ${me.id}`;
    const [{ waiting }] = await tx<{ waiting: number }[]>`
      select count(*)::int as waiting from session_people where session_id = ${sessionId} and finished_at is null`;
    if (waiting) return;
    const [{ sets }] = await tx<{ sets: number }[]>`select count(*)::int as sets from sets where session_id = ${sessionId}`;
    if (sets) await tx`update sessions set ended_at = now() where id = ${sessionId}`;
    else await tx`delete from sessions where id = ${sessionId}`;
  });
}

const NewExercise = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(EXERCISE_KINDS).default("load_reps"),
  equipment: z.enum(EQUIPMENT).default("other"),
});

/** An exercise made in the gym, for one that isn't in the list (§7.2). A name we already use, in any spelling, is that exercise. */
export async function createExercise(me: User, raw: unknown): Promise<ExerciseView> {
  const parsed = NewExercise.safeParse(raw);
  if (!parsed.success) throw new Error("An exercise needs a name.");
  const p = parsed.data;
  const all = await listExercises();
  const same = all.find((e) => [e.name, ...e.aliases].some((s) => fold(s) === fold(p.name)));
  if (same) return same;
  const [{ id }] = await sql<{ id: number }[]>`
    insert into exercises (name, kind, equipment, created_by) values (${p.name}, ${p.kind}, ${p.equipment}, ${me.id}) returning id`;
  return { id, name: p.name, aliases: [], kind: p.kind, equipment: p.equipment, perHand: p.equipment === "dumbbell" || p.equipment === "kettlebell" };
}

/** Every set of one exercise for one person, newest session first, for reading progress over time. */
export async function exerciseHistory(owner: User, exerciseId: number, sinceDate: string | null) {
  const rows = await sql<SetRow[]>`
    select t.*, to_char(s.date, 'YYYY-MM-DD') as date from sets t join sessions s on s.id = t.session_id
    where t.user_id = ${owner.id} and t.exercise_id = ${exerciseId} and (${sinceDate}::date is null or s.date >= ${sinceDate}::date)
    order by s.date desc, t.set_order, t.id`;
  const days: { date: string; sets: SetView[] }[] = [];
  for (const r of rows) {
    if (days[days.length - 1]?.date !== r.date) days.push({ date: r.date, sets: [] });
    days[days.length - 1].sets.push(toSet(r));
  }
  return days;
}
