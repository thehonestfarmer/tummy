import "server-only";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import type { Client } from "./client";
import { fold } from "./fold";

/*
 * Exercises, routines and dated plans (healthspec.md §7.1, §7.2). Plans are
 * written in Claude and pushed here over MCP; nothing in the app edits one.
 * A routine is a plan with no date and a place in its owner's rotation; a
 * dated plan is for one day and wins over the rotation on that day.
 */

export const EXERCISE_KINDS = ["load_reps", "time", "distance", "rounds"] as const;
export const EQUIPMENT = ["barbell", "dumbbell", "kettlebell", "machine", "bodyweight", "other"] as const;
export const BLOCK_KINDS = ["straight", "superset", "emom", "intervals", "finisher", "other"] as const;

export type Equipment = (typeof EQUIPMENT)[number];

export type ExerciseView = {
  id: number;
  name: string;
  aliases: string[];
  kind: (typeof EXERCISE_KINDS)[number];
  equipment: Equipment;
  /** Dumbbell and kettlebell loads are counted per hand (§7.3). */
  perHand: boolean;
};

export type PlanExerciseView = {
  exercise: ExerciseView;
  prescription: string;
  targetSets: number | null;
  repMin: number | null;
  repMax: number | null;
  targetRir: number | null;
  startLoadKg: number | null;
  stepKg: number;
};

export type PlanView = {
  id: number;
  name: string;
  notes: string | null;
  /** Null for a routine. */
  date: string | null;
  /** The routine a dated plan stands in for, by name. */
  standsInFor: string | null;
  blocks: { label: string | null; kind: (typeof BLOCK_KINDS)[number]; exercises: PlanExerciseView[] }[];
};

export type RoutinesView = {
  /** In rotation order. */
  routines: PlanView[];
  /** The dated plan for the day asked about, if there is one. It wins over the rotation. */
  dated: PlanView | null;
  /** The routine the rotation says comes next, by name. */
  next: string | null;
};

/** The smallest jump the gym can load (§7.5): 1.25 kg on a belt, 2.5 kg on a bar or per hand. */
const defaultStep = (equipment: Equipment) => (equipment === "bodyweight" ? 1.25 : 2.5);

const perHand = (equipment: Equipment) => equipment === "dumbbell" || equipment === "kettlebell";

type ExerciseRow = { id: number; name: string; aliases: string[]; kind: ExerciseView["kind"]; equipment: Equipment };

const toExercise = (r: ExerciseRow): ExerciseView => ({ ...r, perHand: perHand(r.equipment) });

/** Every exercise, or those whose name or an alias contains the query. */
export async function listExercises(query?: string): Promise<ExerciseView[]> {
  const rows = await sql<ExerciseRow[]>`select id, name, aliases, kind, equipment from exercises order by lower(name)`;
  const q = fold(query);
  return rows.filter((r) => !q || [r.name, ...r.aliases].some((s) => fold(s).includes(q))).map(toExercise);
}

/** The exercise a name means, exactly, in any of the ways we've written it. */
const exact = (name: string, all: ExerciseRow[]) => all.find((e) => [e.name, ...e.aliases].some((s) => fold(s) === fold(name)));

/** Exercises a name might mean: one contains the other, or they share a word worth sharing. */
function similar(name: string, all: ExerciseRow[]) {
  const key = fold(name);
  const words = new Set(name.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 3));
  return all
    .filter((e) =>
      [e.name, ...e.aliases].some((s) => {
        const k = fold(s);
        return k.includes(key) || key.includes(k) || s.toLowerCase().split(/[^\p{L}\p{N}]+/u).some((w) => words.has(w));
      }),
    )
    .slice(0, 5)
    .map((e) => ({ exercise_id: e.id, name: e.name }));
}

const text = (max: number) => z.string().trim().min(1).max(max);

const ExerciseInput = z
  .object({
    exercise: text(120).describe("The exercise's name. It must match one in list_exercises, by name or alias, unless create_missing is set."),
    prescription: text(400).describe("The line exactly as written in the plan: '3 x 8-12 @ 2 RIR, 90s rest'."),
    target_sets: z.number().int().min(1).max(20).optional().describe("Working sets, not counting warm-ups."),
    rep_min: z.number().int().min(1).max(200).optional(),
    rep_max: z.number().int().min(1).max(200).optional(),
    target_rir: z.number().min(0).max(10).optional(),
    start_load_kg: z
      .number()
      .min(0)
      .max(500)
      .optional()
      .describe("Used only until the person has history. Barbell: total including the 20 kg bar. Dumbbell: per hand including the 2.5 kg handle. Bodyweight: the weight added, 0 for none."),
    step_kg: z.number().positive().max(25).optional().describe("The smallest jump. Defaults to 2.5 (barbell total, or per hand), 1.25 for bodyweight."),
    kind: z.enum(EXERCISE_KINDS).optional().describe("Only used when the exercise is new. Defaults to load_reps."),
    equipment: z.enum(EQUIPMENT).optional().describe("Only used when the exercise is new."),
    aliases: z.array(text(120)).max(10).optional().describe("Other names for it, added to the exercise."),
  })
  .refine((e) => e.rep_min === undefined || e.rep_max === undefined || e.rep_min <= e.rep_max, "rep_min is above rep_max");

export const PlanInput = z.object({
  name: text(60),
  notes: z.string().trim().max(2000).optional(),
  blocks: z
    .array(
      z.object({
        label: z.string().trim().max(60).optional(),
        kind: z.enum(BLOCK_KINDS).default("straight"),
        exercises: z.array(ExerciseInput).min(1).max(12),
      }),
    )
    .min(1)
    .max(12),
});

export type PlanInput = z.infer<typeof PlanInput>;

export type PushResult =
  | { status: "saved"; plan: PlanView; created_exercises: string[] }
  | { status: "unknown_exercises"; unknown: { name: string; similar: { exercise_id: number; name: string }[] }[]; message: string };

/**
 * Creates a plan or replaces the one it names: a routine by its name, a
 * dated plan by its day. Replacing rewrites the blocks and keeps the row,
 * so sessions already done still know which plan they followed.
 *
 * An exercise name that matches nothing writes nothing: the names come
 * back with what they might have meant, so "DB row" doesn't quietly become
 * a second exercise beside "dumbbell row". `createMissing` is the person's
 * yes to the new names.
 */
export async function pushPlan(
  author: User,
  owner: User,
  input: PlanInput,
  opts: { date?: string; standsInFor?: string; position?: number; createMissing?: boolean; client?: Client },
): Promise<PushResult> {
  const all = await sql<ExerciseRow[]>`select id, name, aliases, kind, equipment from exercises`;
  const items = input.blocks.flatMap((b) => b.exercises);
  const unknown = [...new Map(items.filter((i) => !exact(i.exercise, all)).map((i) => [fold(i.exercise), i])).values()];
  if (unknown.length && !opts.createMissing) {
    return {
      status: "unknown_exercises",
      unknown: unknown.map((i) => ({ name: i.exercise, similar: similar(i.exercise, all) })),
      message:
        "Nothing was saved. These exercises aren't in the list. For each, use the existing name it means, or show the " +
        "person the new names and, on yes, send the plan again with create_missing: true.",
    };
  }

  const planId = await sql.begin(async (tx) => {
    for (const i of unknown) {
      const [row] = await tx<ExerciseRow[]>`
        insert into exercises (name, aliases, kind, equipment, created_by)
        values (${i.exercise}, ${i.aliases ?? []}, ${i.kind ?? "load_reps"}, ${i.equipment ?? "other"}, ${author.id})
        returning id, name, aliases, kind, equipment`;
      all.push(row);
    }

    let standsIn: number | null = null;
    if (opts.date && opts.standsInFor) {
      const [routine] = await tx<{ id: number }[]>`
        select id from plans where user_id = ${owner.id} and date is null and archived_at is null and lower(name) = lower(${opts.standsInFor})`;
      if (!routine) throw new Error(`${owner.displayName} has no routine called ${opts.standsInFor}.`);
      standsIn = routine.id;
    }

    const [existing] = opts.date
      ? await tx<{ id: number }[]>`select id from plans where user_id = ${owner.id} and date = ${opts.date} for update`
      : await tx<{ id: number }[]>`
          select id from plans where user_id = ${owner.id} and date is null and archived_at is null and lower(name) = lower(${input.name}) for update`;
    let id: number;
    if (existing) {
      id = existing.id;
      await tx`update plans set name = ${input.name}, notes = ${input.notes || null}, stands_in_for = ${standsIn}, updated_at = now() where id = ${id}`;
      await tx`delete from plan_blocks where plan_id = ${id}`;
    } else {
      [{ id }] = await tx<{ id: number }[]>`
        insert into plans (user_id, name, notes, date, stands_in_for, created_by, client)
        values (${owner.id}, ${input.name}, ${input.notes || null}, ${opts.date ?? null}, ${standsIn}, ${author.id}, ${opts.client ?? "pwa"})
        returning id`;
    }

    for (const [b, block] of input.blocks.entries()) {
      const [{ id: blockId }] = await tx<{ id: number }[]>`
        insert into plan_blocks (plan_id, position, label, kind) values (${id}, ${b}, ${block.label || null}, ${block.kind}) returning id`;
      for (const [e, item] of block.exercises.entries()) {
        const exercise = exact(item.exercise, all)!;
        const added = (item.aliases ?? []).filter((a) => ![exercise.name, ...exercise.aliases].some((s) => fold(s) === fold(a)));
        if (added.length) {
          exercise.aliases = [...exercise.aliases, ...added];
          await tx`update exercises set aliases = ${exercise.aliases} where id = ${exercise.id}`;
        }
        await tx`
          insert into plan_exercises (block_id, position, exercise_id, prescription, target_sets, rep_min, rep_max, target_rir, start_load_kg, step_kg)
          values (${blockId}, ${e}, ${exercise.id}, ${item.prescription}, ${item.target_sets ?? null}, ${item.rep_min ?? null},
                  ${item.rep_max ?? null}, ${item.target_rir ?? null}, ${item.start_load_kg ?? null},
                  ${item.step_kg ?? defaultStep(exercise.equipment)})`;
      }
    }

    // The rotation is the routines in order, numbered from 1 with no gaps. A new one goes last unless told where.
    if (!opts.date) {
      const order = (
        await tx<{ id: number }[]>`
          select id from plans where user_id = ${owner.id} and date is null and archived_at is null
          order by position asc nulls last, id asc`
      ).map((r) => r.id);
      if (opts.position !== undefined) {
        order.splice(order.indexOf(id), 1);
        order.splice(Math.min(order.length, Math.max(0, opts.position - 1)), 0, id);
      }
      for (const [i, routine] of order.entries()) await tx`update plans set position = ${i + 1} where id = ${routine}`;
    }
    return id;
  });

  return { status: "saved", plan: (await plansById([planId]))[0], created_exercises: unknown.map((i) => i.exercise) };
}

/** Takes a routine out of the rotation. Sessions that followed it keep their history. */
export async function removeRoutine(owner: User, name: string): Promise<void> {
  const rows = await sql`
    update plans set archived_at = now(), position = null
    where user_id = ${owner.id} and date is null and archived_at is null and lower(name) = lower(${name}) returning id`;
  if (!rows.length) throw new Error(`${owner.displayName} has no routine called ${name}.`);
  const left = await sql<{ id: number }[]>`
    select id from plans where user_id = ${owner.id} and date is null and archived_at is null order by position asc nulls last, id asc`;
  for (const [i, r] of left.entries()) await sql`update plans set position = ${i + 1} where id = ${r.id}`;
}

type PlanRow = { id: number; name: string; notes: string | null; date: string | null; stands_in_name: string | null };
type LineRow = ExerciseRow & {
  plan_id: number;
  block_id: number;
  label: string | null;
  block_kind: (typeof BLOCK_KINDS)[number];
  prescription: string;
  target_sets: number | null;
  rep_min: number | null;
  rep_max: number | null;
  target_rir: number | null;
  start_load_kg: number | null;
  step_kg: number;
};

/** Whole plans, in the order asked for. */
export async function plansById(ids: number[]): Promise<PlanView[]> {
  if (!ids.length) return [];
  const [plans, lines] = await Promise.all([
    sql<PlanRow[]>`
      select p.id, p.name, p.notes, to_char(p.date, 'YYYY-MM-DD') as date, r.name as stands_in_name
      from plans p left join plans r on r.id = p.stands_in_for where p.id = any(${ids})`,
    sql<LineRow[]>`
      select b.plan_id, b.id as block_id, b.label, b.kind as block_kind,
             x.id, x.name, x.aliases, x.kind, x.equipment,
             pe.prescription, pe.target_sets, pe.rep_min, pe.rep_max, pe.target_rir, pe.start_load_kg, pe.step_kg
      from plan_blocks b
      join plan_exercises pe on pe.block_id = b.id
      join exercises x on x.id = pe.exercise_id
      where b.plan_id = any(${ids})
      order by b.plan_id, b.position, b.id, pe.position, pe.id`,
  ]);
  return ids.flatMap((id) => {
    const p = plans.find((x) => x.id === id);
    if (!p) return [];
    const blocks: PlanView["blocks"] = [];
    let last = -1;
    for (const l of lines.filter((x) => x.plan_id === id)) {
      if (l.block_id !== last) blocks.push({ label: l.label, kind: l.block_kind, exercises: [] });
      last = l.block_id;
      blocks[blocks.length - 1].exercises.push({
        exercise: toExercise({ id: l.id, name: l.name, aliases: l.aliases, kind: l.kind, equipment: l.equipment }),
        prescription: l.prescription,
        targetSets: l.target_sets,
        repMin: l.rep_min,
        repMax: l.rep_max,
        targetRir: l.target_rir,
        startLoadKg: l.start_load_kg,
        stepKg: l.step_kg,
      });
    }
    return [{ id: p.id, name: p.name, notes: p.notes, date: p.date, standsInFor: p.stands_in_name, blocks }];
  });
}

/**
 * A person's routines in rotation order, the dated plan for `date` if there
 * is one, and which routine comes next: the one after the last routine they
 * trained (§7.4). A dated plan counts as the routine it stood in for. With
 * no history, or when the last one has since been removed, the rotation
 * starts from the top.
 */
export async function getRoutines(owner: User, date: string): Promise<RoutinesView> {
  const [rotation, [dated], [last]] = await Promise.all([
    sql<{ id: number; position: number }[]>`
      select id, position from plans where user_id = ${owner.id} and date is null and archived_at is null
      order by position asc nulls last, id asc`,
    sql<{ id: number }[]>`select id from plans where user_id = ${owner.id} and date = ${date}`,
    sql<{ routine_id: number }[]>`
      select coalesce(p.stands_in_for, case when p.date is null then p.id end) as routine_id
      from session_people sp join plans p on p.id = sp.plan_id
      where sp.user_id = ${owner.id} and coalesce(p.stands_in_for, case when p.date is null then p.id end) is not null
        and exists (select 1 from sets t where t.session_id = sp.session_id and t.user_id = sp.user_id)
      order by sp.joined_at desc limit 1`,
  ]);
  const plans = await plansById([...rotation.map((r) => r.id), ...(dated ? [dated.id] : [])]);
  const routines = plans.filter((p) => p.date === null);
  const at = last ? rotation.findIndex((r) => r.id === last.routine_id) : -1;
  const next = routines.length ? routines[(at + 1) % routines.length].name : null;
  return { routines, dated: plans.find((p) => p.date !== null) ?? null, next };
}
