"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ExerciseView } from "@/lib/health/plans";
import type { SetView, WorkoutExercise, WorkoutView } from "@/lib/health/workout";
import { fold } from "@/lib/health/fold";
import { usePoll } from "@/lib/usePoll";
import { useHealthDay } from "./HealthDay";
import { colorOf } from "./MacroBar";
import { Sheet } from "./Sheet";
import { fmt } from "./fields";

const stepButton =
  "flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[1.6rem] leading-none text-ink disabled:text-ink-faint";
const chip = "h-10 rounded-full border px-3.5 text-[0.9rem]";
const primary = "h-16 w-full rounded-xl bg-ink text-[1.15rem] font-bold text-ground disabled:opacity-50";
const numeric = (raw: string) => raw.replace(/[^\d.,]/g, "").replace(",", ".");

export async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "That didn't work");
  return json;
}

/** A load as it is said in the gym: "40 kg", "12.5 kg each", "+5 kg", or nothing added. */
export function loadText(kg: number | null, e: ExerciseView): string {
  if (e.equipment === "bodyweight") return kg ? `+${fmt(kg, 2)} kg` : "bodyweight";
  if (kg === null) return "";
  return `${fmt(kg, 2)} kg${e.perHand ? " each" : ""}`;
}

/** One set in a few characters: "40 × 8", "45s", "20m", "6 rounds". */
export function setText(s: SetView, e: ExerciseView, withLoad = true): string {
  if (s.kind === "time") return `${fmt(s.seconds ?? 0)}s`;
  if (s.kind === "distance") return `${fmt(s.meters ?? 0)}m${s.loadKg ? ` · ${fmt(s.loadKg, 2)} kg` : ""}`;
  if (s.kind === "rounds") return `${fmt(s.rounds ?? 0)} rounds`;
  if (!withLoad) return String(s.reps ?? 0);
  return e.equipment === "bodyweight" && !s.loadKg ? `${s.reps ?? 0} reps` : `${fmt(s.loadKg ?? 0, 2)} × ${s.reps ?? 0}`;
}

const working = (e: WorkoutExercise) => e.sets.filter((s) => !s.warmup).length;
const done = (e: WorkoutExercise) => e.targetSets !== null && working(e) >= e.targetSets;

/**
 * The exercise to do now when nobody has chosen one: the first unfinished in
 * plan order. In a superset it is whichever of the block's exercises is
 * furthest behind, so the two alternate (§7.4).
 */
function nextUp(exercises: WorkoutExercise[]): WorkoutExercise | null {
  const open = exercises.find((e) => e.block && !done(e));
  if (!open) return exercises.find((e) => !e.block) ?? null;
  if (open.block!.kind !== "superset") return open;
  const block = exercises.filter((e) => e.block?.index === open.block!.index && !done(e));
  return block.reduce((a, b) => (working(b) < working(a) ? b : a));
}

/** Minutes and seconds since a moment, ticking. Derived from the last set; there is no timer to start or stop. */
function Since({ at }: { at: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const s = Math.max(0, Math.floor((now - new Date(at).getTime()) / 1000));
  return (
    <span className="tabular-nums" suppressHydrationWarning>
      {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
    </span>
  );
}

/** The workout urls for one person: plain for yourself, `?who=` for your partner (§7.4). */
export function useWho(slug: string) {
  const { day } = useHealthDay();
  const other = slug !== day.me.slug;
  return { other, query: other ? `?who=${slug}` : "", people: [day.me, day.partner] };
}

/**
 * Whose workout is on screen. Either of us can look at, start and log the
 * other's from our own phone; the sets remember who entered them.
 */
export function WhoSwitch({ slug, path }: { slug: string; path: string }) {
  const { day } = useHealthDay();
  return (
    <div className="flex gap-1.5" role="group" aria-label="Whose workout">
      {[day.me, day.partner].map((p) => {
        const on = p.slug === slug;
        return (
          <Link
            key={p.slug}
            href={p.slug === day.me.slug ? path : `${path}?who=${p.slug}`}
            aria-current={on ? "true" : undefined}
            className="flex h-9 items-center gap-1.5 rounded-full border px-3 text-[0.9rem]"
            style={{ borderColor: on ? "var(--ink-dim)" : "var(--hairline)", color: on ? "var(--ink)" : "var(--ink-dim)", background: on ? "var(--ground-raised)" : "transparent" }}
          >
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ background: colorOf(p.slug) }} />
            {p.displayName}
          </Link>
        );
      })}
    </div>
  );
}

/**
 * What Start workout asks (§7.4): what are you doing today? Already
 * answered with today's dated plan or the next routine in the rotation; the
 * others, and No plan, are one tap away.
 */
export function StartChooser({ view, onStarted }: { view: WorkoutView; onStarted: (next: WorkoutView) => void }) {
  const { other, query } = useWho(view.who.slug);
  const [picked, setPicked] = useState<number | null>(view.choices[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const name = view.choices.find((c) => c.id === picked)?.name;
  const row = (on: boolean) =>
    `flex w-full items-baseline gap-2 rounded-xl border px-3.5 py-3.5 text-left ${on ? "border-ink-dim bg-ground-raised text-ink" : "border-hairline text-ink-dim"}`;

  return (
    <div>
      <p className="text-[1.15rem] leading-snug">
        {view.joinable
          ? `${view.joinable.by} is training${view.joinable.planName ? `: ${view.joinable.planName}` : ""}.`
          : other
            ? `What is ${view.who.displayName} doing today?`
            : "What are you doing today?"}
      </p>
      {view.joinable ? <p className="pt-1 text-[0.9rem] text-ink-dim">{other ? `${view.who.displayName} joins with their own plan.` : "Join with your own plan."}</p> : null}
      <div className="flex flex-col gap-2 pt-4">
        {view.choices.map((c) => (
          <button key={c.id} aria-pressed={picked === c.id} onClick={() => setPicked(c.id)} className={row(picked === c.id)}>
            <span className="min-w-0 flex-1 truncate text-[1.05rem]">{c.name}</span>
            <span className="shrink-0 text-[0.8rem] text-ink-faint">
              {c.dated ? "for today" : c.next ? "next up" : ""}
              {c.dated || c.next ? " · " : ""}
              {c.exercises} exercises
            </span>
          </button>
        ))}
        <button aria-pressed={picked === null} onClick={() => setPicked(null)} className={row(picked === null)}>
          <span className="min-w-0 flex-1 text-[1.05rem]">No plan</span>
          <span className="shrink-0 text-[0.8rem] text-ink-faint">add exercises as you go</span>
        </button>
      </div>
      {!view.choices.length ? (
        <p className="pt-3 text-[0.85rem] leading-relaxed text-ink-dim">No routines yet. They come from Claude; until then, train with no plan.</p>
      ) : null}
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            onStarted((await send(`/api/workout${query}`, "POST", { action: "start", planId: picked })) as WorkoutView);
          } catch (err) {
            setError(err instanceof Error ? err.message : "That didn't work");
            setBusy(false);
          }
        }}
        className={`${primary} mt-5`}
      >
        {busy ? "…" : `${view.joinable ? "Join" : "Start"}${name ? ` · ${name}` : ""}`}
      </button>
      {error ? <p className="pt-2 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </div>
  );
}

/** A number with a stepper either side, big enough for chalked hands. */
function Stepper({ label, unit, text, onText, by, min = 0 }: { label: string; unit: string; text: string; onText: (t: string) => void; by: number; min?: number }) {
  const n = Number(text) || 0;
  const move = (d: number) => onText(String(Math.max(min, Math.round((n + d) * 100) / 100)));
  return (
    <div className="flex items-center gap-3">
      <button aria-label={`Less ${label}`} onClick={() => move(-by)} disabled={n <= min} className={stepButton}>
        −
      </button>
      <label className="flex min-w-0 flex-1 items-baseline justify-center gap-2 rounded-xl border border-hairline bg-ground-sunk px-3 py-2.5">
        <input
          aria-label={label}
          inputMode="decimal"
          value={text}
          onChange={(e) => onText(numeric(e.target.value))}
          className="w-24 min-w-0 bg-transparent text-right text-[1.9rem] font-bold tabular-nums text-ink focus:outline-none"
        />
        <span className="w-16 text-[0.95rem] text-ink-dim">{unit}</span>
      </label>
      <button aria-label={`More ${label}`} onClick={() => move(by)} className={stepButton}>
        +
      </button>
    </div>
  );
}

/**
 * The active exercise's set, filled in from the suggestion (§7.5) and
 * logged with one button. Remounted after every set, so each starts from the
 * one before.
 */
function LogPanel({ ex, url, onLogged }: { ex: WorkoutExercise; url: string; onLogged: (w: WorkoutView, id: number, text: string) => void }) {
  const s = ex.suggestion;
  const kind = ex.exercise.kind;
  const [load, setLoad] = useState(s.loadKg === null ? "" : String(s.loadKg));
  const [main, setMain] = useState(String((kind === "load_reps" ? s.reps : kind === "time" ? s.seconds : kind === "distance" ? s.meters : s.rounds) ?? (kind === "time" ? 30 : kind === "distance" ? 20 : kind === "rounds" ? 1 : 8)));
  const [warmup, setWarmup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const amount = Number(main);
  const ok = main !== "" && Number.isFinite(amount) && amount > 0;
  const loadKg = load === "" ? null : Number(load);
  const withLoad = kind === "load_reps" || kind === "distance";
  const bodyweight = ex.exercise.equipment === "bodyweight";

  const said =
    kind === "load_reps"
      ? bodyweight && !loadKg
        ? `${main} reps`
        : `${fmt(loadKg ?? 0, 2)} × ${main}`
      : kind === "time"
        ? `${main}s`
        : kind === "distance"
          ? `${main}m`
          : `${main} rounds`;

  async function log() {
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const json = (await send(url.replace("/api/workout", "/api/workout/sets"), "POST", {
        exerciseId: ex.exercise.id,
        warmup,
        loadKg: withLoad ? (loadKg ?? 0) : null,
        reps: kind === "load_reps" ? Math.round(amount) : null,
        seconds: kind === "time" ? amount : null,
        meters: kind === "distance" ? amount : null,
        rounds: kind === "rounds" ? amount : null,
      })) as { id: number; workout: WorkoutView };
      onLogged(json.workout, json.id, said);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-2.5 pt-4">
      {withLoad ? (
        <Stepper label="load" unit={bodyweight ? "kg added" : ex.exercise.perHand ? "kg each" : "kg"} text={load} onText={setLoad} by={ex.stepKg} />
      ) : null}
      <Stepper
        label={kind === "load_reps" ? "reps" : kind === "time" ? "seconds" : kind === "distance" ? "meters" : "rounds"}
        unit={kind === "load_reps" ? "reps" : kind === "time" ? "sec" : kind === "distance" ? "m" : "rounds"}
        text={main}
        onText={setMain}
        by={kind === "time" || kind === "distance" ? 5 : 1}
      />
      <div className="flex items-stretch gap-2 pt-1">
        <button
          aria-pressed={warmup}
          onClick={() => setWarmup((w) => !w)}
          className="h-16 shrink-0 rounded-xl border px-4 text-[0.95rem]"
          style={{ borderColor: warmup ? "var(--ink-dim)" : "var(--hairline-strong)", background: warmup ? "var(--ground-raised)" : "transparent", color: warmup ? "var(--ink)" : "var(--ink-dim)" }}
        >
          Warm-up
        </button>
        <button onClick={log} disabled={busy || !ok} className={primary}>
          {busy ? "…" : warmup ? `Log warm-up · ${said}` : `Log set ${working(ex) + 1}${ex.targetSets ? ` of ${ex.targetSets}` : ""} · ${said}`}
        </button>
      </div>
      {error ? <p className="text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </div>
  );
}

/** Correcting a set already logged: its numbers, reps in reserve, warm-up or not, or removing it. */
export function SetSheet({ set, ex, url, onDone, onClose }: { set: SetView; ex: ExerciseView; url: string; onDone: (w: WorkoutView) => void; onClose: () => void }) {
  const [load, setLoad] = useState(set.loadKg === null ? "" : String(set.loadKg));
  const mainOf = set.kind === "load_reps" ? set.reps : set.kind === "time" ? set.seconds : set.kind === "distance" ? set.meters : set.rounds;
  const [main, setMain] = useState(String(mainOf ?? 0));
  const [rir, setRir] = useState<number | null>(set.rir);
  const [warmup, setWarmup] = useState(set.warmup);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const target = url.replace("/api/workout", `/api/workout/sets/${set.id}`);

  async function run(method: "PATCH" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      const n = Number(main) || 0;
      const body =
        method === "DELETE"
          ? undefined
          : {
              warmup,
              rir,
              ...(set.kind === "load_reps" || set.kind === "distance" ? { loadKg: load === "" ? 0 : Number(load) } : {}),
              ...(set.kind === "load_reps" ? { reps: Math.round(n) } : set.kind === "time" ? { seconds: n } : set.kind === "distance" ? { meters: n } : { rounds: n }),
            };
      onDone(((await send(target, method, body)) as { workout: WorkoutView }).workout);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <p className="text-[1.1rem]">{ex.name}</p>
      <p className="text-[0.85rem] text-ink-dim">Set as logged: {setText(set, ex)}</p>
      <div className="flex flex-col gap-2.5 pt-4">
        {set.kind === "load_reps" || set.kind === "distance" ? (
          <Stepper label="load" unit={ex.equipment === "bodyweight" ? "kg added" : ex.perHand ? "kg each" : "kg"} text={load} onText={setLoad} by={ex.equipment === "bodyweight" ? 1.25 : 2.5} />
        ) : null}
        <Stepper
          label="amount"
          unit={set.kind === "load_reps" ? "reps" : set.kind === "time" ? "sec" : set.kind === "distance" ? "m" : "rounds"}
          text={main}
          onText={setMain}
          by={set.kind === "time" || set.kind === "distance" ? 5 : 1}
        />
      </div>
      {set.kind === "load_reps" ? (
        <>
          <p className="pt-4 pb-1.5 text-[0.8rem] text-ink-faint">Reps in reserve</p>
          <div className="flex gap-1.5">
            {[0, 1, 2, 3, 4].map((r) => (
              <button
                key={r}
                aria-pressed={rir === r}
                onClick={() => setRir(rir === r ? null : r)}
                className={`${chip} flex-1`}
                style={{ borderColor: rir === r ? "var(--ink-dim)" : "var(--hairline)", background: rir === r ? "var(--ground-raised)" : "transparent" }}
              >
                {r === 4 ? "4+" : r}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <button
        aria-pressed={warmup}
        onClick={() => setWarmup((w) => !w)}
        className={`${chip} mt-3`}
        style={{ borderColor: warmup ? "var(--ink-dim)" : "var(--hairline)", color: warmup ? "var(--ink)" : "var(--ink-dim)" }}
      >
        {warmup ? "Warm-up set" : "Working set"}
      </button>
      <div className="flex gap-2 pt-5">
        <button disabled={busy} onClick={() => run("DELETE")} className="h-12 rounded-xl border border-hairline px-4 text-[0.95rem] text-danger">
          Remove
        </button>
        <button disabled={busy} onClick={() => run("PATCH")} className="h-12 flex-1 rounded-xl bg-ink text-[1rem] font-bold text-ground disabled:opacity-50">
          {busy ? "…" : "Save"}
        </button>
      </div>
      {error ? <p className="pt-2 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </Sheet>
  );
}

/** Finding an exercise that isn't in today's plan, or making one that isn't in the list at all (§7.4). */
function AddExerciseSheet({ have, onPick, onClose }: { have: Set<number>; onPick: (e: ExerciseView) => void; onClose: () => void }) {
  const [all, setAll] = useState<ExerciseView[] | null>(null);
  const [query, setQuery] = useState("");
  const [equipment, setEquipment] = useState<ExerciseView["equipment"]>("barbell");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/exercises", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { exercises: ExerciseView[] }) => setAll(j.exercises ?? []))
      .catch(() => setAll([]));
  }, []);

  const q = fold(query.trim());
  const found = (all ?? []).filter((e) => !have.has(e.id) && (!q || [e.name, ...e.aliases].some((s) => fold(s).includes(q))));
  const exact = (all ?? []).some((e) => [e.name, ...e.aliases].some((s) => fold(s) === q));

  async function create() {
    setBusy(true);
    setError(null);
    try {
      onPick((await send("/api/exercises", "POST", { name: query.trim(), equipment })) as ExerciseView);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose} tall>
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="pb-2 text-[1.1rem]">Add an exercise</p>
        <ul className="min-h-0 flex-1 overflow-y-auto">
          {found.map((e) => (
            <li key={e.id} className="border-b border-hairline">
              <button onClick={() => onPick(e)} className="flex w-full items-baseline gap-2 py-3 text-left">
                <span className="min-w-0 flex-1 truncate text-[1rem]">{e.name}</span>
                <span className="shrink-0 text-[0.8rem] text-ink-faint">{e.equipment === "other" ? "" : e.equipment}</span>
              </button>
            </li>
          ))}
          {all && !found.length && !q ? <li className="py-3 text-[0.95rem] text-ink-dim">No exercises yet. Type a name to make the first.</li> : null}
        </ul>
        {q && !exact ? (
          <div className="border-t border-hairline pt-3">
            <p className="pb-1.5 text-[0.8rem] text-ink-faint">New exercise &ldquo;{query.trim()}&rdquo;, done with</p>
            <div className="flex flex-wrap gap-1.5">
              {(["barbell", "dumbbell", "kettlebell", "machine", "bodyweight", "other"] as const).map((k) => (
                <button
                  key={k}
                  aria-pressed={equipment === k}
                  onClick={() => setEquipment(k)}
                  className={chip}
                  style={{ borderColor: equipment === k ? "var(--ink-dim)" : "var(--hairline)", color: equipment === k ? "var(--ink)" : "var(--ink-dim)", background: equipment === k ? "var(--ground-raised)" : "transparent" }}
                >
                  {k}
                </button>
              ))}
            </div>
            <button disabled={busy} onClick={create} className="mt-2.5 h-12 w-full rounded-xl border border-hairline-strong bg-ground-raised text-[1rem] text-ink">
              {busy ? "…" : `Add ${query.trim()}`}
            </button>
          </div>
        ) : null}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Exercise name"
          className="mt-3 h-12 w-full rounded-xl border border-hairline bg-ground-sunk px-3.5 text-[1rem] text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
        />
        {error ? <p className="pt-2 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
      </div>
    </Sheet>
  );
}

function FinishSheet({ exercises, url, onDone, onClose }: { exercises: WorkoutExercise[]; url: string; onDone: (w: WorkoutView) => void; onClose: () => void }) {
  const [rating, setRating] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sets = exercises.reduce((n, e) => n + working(e), 0);
  return (
    <Sheet onClose={onClose}>
      <p className="text-[1.15rem]">Finish</p>
      <p className="text-[0.85rem] text-ink-dim">
        {sets} working {sets === 1 ? "set" : "sets"} across {exercises.filter((e) => e.sets.length).length} exercises
      </p>
      <p className="pt-4 pb-1.5 text-[0.8rem] text-ink-faint">How was it, out of 10?</p>
      <div className="grid grid-cols-11 gap-1">
        {Array.from({ length: 11 }, (_, r) => (
          <button
            key={r}
            aria-pressed={rating === r}
            onClick={() => setRating(rating === r ? null : r)}
            className="h-11 rounded-[10px] border text-[0.95rem] tabular-nums"
            style={{ borderColor: rating === r ? "var(--ink-dim)" : "var(--hairline)", background: rating === r ? "var(--ground-raised)" : "transparent" }}
          >
            {r}
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="A note, if there's something to remember"
        rows={2}
        className="mt-3 w-full rounded-xl border border-hairline bg-ground-sunk px-3.5 py-2.5 text-[1rem] text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
      />
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            onDone((await send(url, "POST", { action: "finish", rating, note })) as WorkoutView);
          } catch (err) {
            setError(err instanceof Error ? err.message : "That didn't work");
            setBusy(false);
          }
        }}
        className={`${primary} mt-4`}
      >
        {busy ? "…" : "Finish workout"}
      </button>
      {error ? <p className="pt-2 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </Sheet>
  );
}

/** The sets of one exercise as tappable chips; warm-ups smaller and dimmer (§7.4). */
function SetChips({ ex, onEdit }: { ex: WorkoutExercise; onEdit: (s: SetView) => void }) {
  if (!ex.sets.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5 pt-2.5">
      {ex.sets.map((s) => (
        <button
          key={s.id}
          onClick={() => onEdit(s)}
          className={`rounded-full border border-hairline tabular-nums ${s.warmup ? "h-8 px-2.5 text-[0.8rem] text-ink-faint" : "h-9 px-3 text-[0.9rem] text-ink"}`}
        >
          {setText(s, ex.exercise)}
          {s.rir !== null ? <span className="text-ink-faint"> · {fmt(s.rir)} left</span> : null}
        </button>
      ))}
    </div>
  );
}

const lastLine = (ex: WorkoutExercise) => {
  if (!ex.last.length) return null;
  const sameLoad = ex.last.every((s) => s.loadKg === ex.last[0].loadKg);
  return ex.exercise.kind === "load_reps" && sameLoad && !(ex.exercise.equipment === "bodyweight" && !ex.last[0].loadKg)
    ? `${fmt(ex.last[0].loadKg ?? 0, 2)} × ${ex.last.map((s) => s.reps ?? 0).join(", ")}`
    : ex.last.map((s) => setText(s, ex.exercise)).join(", ");
};

/**
 * Workout mode (healthspec.md §7.4, §8). One person's session: your own, or
 * your partner's when you are logging for them. The day's exercises in order, the active one large with today's suggested
 * load and last time's sets, and one button that logs the set as it stands.
 * It re-reads itself every few seconds, so a set logged from a chat shows up
 * here without a reload.
 */
export function Workout({ initial }: { initial: WorkoutView }) {
  const { toast } = useHealthDay();
  const { other, query } = useWho(initial.who.slug);
  const ADDED = `tummy-workout-added${other ? `-${initial.who.slug}` : ""}`;
  const [added, setAdded] = useState<number[]>([]);
  const url = `/api/workout${query}${added.length ? `${query ? "&" : "?"}add=${added.join(",")}` : ""}`;
  const { data, setData } = usePoll<WorkoutView>(url, 8_000, initial);
  const [pinned, setPinned] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ set: SetView; ex: ExerciseView } | null>(null);
  const [adding, setAdding] = useState(false);
  const [finishing, setFinishing] = useState(false);

  // Exercises added but not yet done live only on this phone (§7.4), so keep them across a reload.
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        const kept = JSON.parse(sessionStorage.getItem(ADDED) ?? "[]") as number[];
        if (Array.isArray(kept) && kept.length) setAdded(kept);
      } catch {
        // Nothing kept.
      }
    }, 0);
    return () => clearTimeout(t);
  }, [ADDED]);
  const keep = (ids: number[]) => {
    setAdded(ids);
    try {
      sessionStorage.setItem(ADDED, JSON.stringify(ids));
    } catch {
      // Private mode: they just don't survive a reload.
    }
  };

  const session = data.session;

  if (!session || (!session.open && !data.trained)) {
    return (
      <div className="px-5 pt-3 pb-6">
        <div className="flex items-center justify-between pb-4">
          <WhoSwitch slug={data.who.slug} path="/workout" />
          <Link href={`/workouts${query}`} className="text-[0.9rem] text-ink-dim underline decoration-hairline-strong underline-offset-4">
            Routines and history
          </Link>
        </div>
        <StartChooser view={data} onStarted={setData} />
      </div>
    );
  }

  const live = session.open && !session.finished;
  const pinnedEx = session.exercises.find((e) => e.exercise.id === pinned);
  const active = live ? (pinnedEx ?? nextUp(session.exercises)) : null;

  const logged = (w: WorkoutView, id: number, text: string) => {
    setData(w);
    // Stay on a chosen exercise until its sets are done; a superset alternates, so it lets go at once.
    const now = w.session?.exercises.find((e) => e.exercise.id === pinned);
    if (now && (done(now) || now.block?.kind === "superset")) setPinned(null);
    toast({
      text: `Logged ${text}`,
      undo: async () => setData(((await send(url.replace("/api/workout", `/api/workout/sets/${id}`), "DELETE")) as { workout: WorkoutView }).workout),
    });
  };

  const rate = async (s: SetView, rir: number) => {
    try {
      setData(((await send(url.replace("/api/workout", `/api/workout/sets/${s.id}`), "PATCH", { rir })) as { workout: WorkoutView }).workout);
    } catch {
      // It stays unanswered, and can be set from the set itself.
    }
  };

  const ups = session.exercises.filter((e) => e.goesUpTo !== null);

  return (
    <div className="px-5 pt-3 pb-8">
      <div className="flex items-center justify-between pb-3">
        <WhoSwitch slug={data.who.slug} path="/workout" />
        <Link href={`/workouts${query}`} className="text-[0.9rem] text-ink-dim underline decoration-hairline-strong underline-offset-4">
          Routines and history
        </Link>
      </div>
      <header className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[1.15rem] leading-tight">
            {other ? `${data.who.displayName} · ` : ""}
            {live ? (session.planName ?? "Workout") : `Trained · ${session.planName ?? "no plan"}`}
          </h1>
          <p className="text-[0.85rem] text-ink-dim">
            {live ? (
              session.lastSetAt ? (
                <>
                  <Since at={session.lastSetAt} /> since the last set
                </>
              ) : (
                "No sets yet"
              )
            ) : (
              <>
                {session.rating !== null ? `${session.rating}/10` : "Done"}
                {session.note ? ` · ${session.note}` : ""}
              </>
            )}
          </p>
        </div>
        {live ? (
          <button onClick={() => setFinishing(true)} className="h-11 shrink-0 rounded-full border border-hairline-strong px-4 text-[0.95rem] text-ink">
            Finish
          </button>
        ) : session.open ? (
          <button
            onClick={async () => setData((await send(`/api/workout${query}`, "POST", { action: "start", planId: null })) as WorkoutView)}
            className="h-11 shrink-0 rounded-full border border-hairline-strong px-4 text-[0.95rem] text-ink"
          >
            Back to it
          </button>
        ) : null}
      </header>

      {!live && ups.length ? (
        <ul className="mt-4 rounded-xl border border-hairline bg-ground-raised px-3.5 py-3 text-[0.95rem]">
          {ups.map((e) => (
            <li key={e.exercise.id}>
              {e.exercise.name} goes up to {loadText(e.goesUpTo, e.exercise)} next time.
            </li>
          ))}
        </ul>
      ) : null}

      <ul className="flex flex-col gap-2 pt-4">
        {session.exercises.map((ex, i) => {
          const before = session.exercises[i - 1];
          const header = i === 0 || (before.block?.index ?? null) !== (ex.block?.index ?? null);
          const isActive = active?.exercise.id === ex.exercise.id;
          const latest = ex.sets[ex.sets.length - 1];
          const last = lastLine(ex);
          return (
            <li key={ex.exercise.id}>
              {header ? (
                <p className="pt-2 pb-1 text-[0.8rem] text-ink-faint">
                  {ex.block ? [ex.block.label, ex.block.kind === "straight" ? null : ex.block.kind].filter(Boolean).join(" · ") : "Added today"}
                </p>
              ) : null}
              {isActive ? (
                <div className="rounded-xl border border-hairline-strong bg-ground-raised px-3.5 py-3.5">
                  <div className="flex items-baseline gap-2">
                    <h2 className="min-w-0 flex-1 text-[1.3rem] leading-tight">{ex.exercise.name}</h2>
                    <span className="shrink-0 text-[0.95rem] tabular-nums text-ink-dim">
                      {working(ex)}
                      {ex.targetSets ? ` / ${ex.targetSets}` : ""}
                    </span>
                  </div>
                  {ex.prescription ? <p className="pt-1 text-[0.95rem] text-ink-dim">{ex.prescription}</p> : null}
                  {!ex.sets.length && ex.exercise.kind === "load_reps" && ex.suggestion.loadKg !== null ? (
                    <p className="pt-2 text-[1rem]">
                      Today: {loadText(ex.suggestion.loadKg, ex.exercise)}
                      {ex.repMin && ex.repMax ? ` for ${ex.repMin}–${ex.repMax}` : ""}
                      {ex.suggestion.note ? <span className="text-ink-dim"> · {ex.suggestion.note}</span> : null}
                    </p>
                  ) : null}
                  {last ? (
                    <p className="pt-0.5 text-[0.9rem] tabular-nums text-ink-dim">Last time: {last}</p>
                  ) : (
                    <p className="pt-0.5 text-[0.9rem] text-ink-faint">First time logging this.</p>
                  )}
                  <SetChips ex={ex} onEdit={(set) => setEditing({ set, ex: ex.exercise })} />
                  {latest && latest.kind === "load_reps" && !latest.warmup && latest.rir === null ? (
                    <div className="flex items-center gap-1.5 pt-3">
                      <span className="pr-1 text-[0.85rem] text-ink-dim">Reps left?</span>
                      {[0, 1, 2, 3, 4].map((r) => (
                        <button key={r} onClick={() => rate(latest, r)} className="h-10 flex-1 rounded-full border border-hairline text-[0.95rem] tabular-nums text-ink">
                          {r === 4 ? "4+" : r}
                        </button>
                      ))}
                    </div>
                  ) : null}
                  {ex.goesUpTo !== null ? <p className="pt-2.5 text-[0.9rem] text-ink-dim">Top of the range on every set: {loadText(ex.goesUpTo, ex.exercise)} next time.</p> : null}
                  <LogPanel key={`${ex.exercise.id}-${ex.sets.length}`} ex={ex} url={url} onLogged={logged} />
                </div>
              ) : (
                <div className="rounded-xl border border-hairline px-3.5 py-3">
                  <button disabled={!live} onClick={() => setPinned(ex.exercise.id)} className="flex w-full items-baseline gap-2 text-left">
                    <span className={`min-w-0 flex-1 truncate text-[1.02rem] ${done(ex) ? "text-ink-dim" : "text-ink"}`}>{ex.exercise.name}</span>
                    <span className="shrink-0 text-[0.9rem] tabular-nums text-ink-dim">
                      {working(ex)}
                      {ex.targetSets ? ` / ${ex.targetSets}` : ""}
                    </span>
                  </button>
                  {ex.sets.length ? (
                    <SetChips ex={ex} onEdit={(set) => setEditing({ set, ex: ex.exercise })} />
                  ) : ex.prescription ? (
                    <p className="pt-0.5 text-[0.85rem] text-ink-faint">{ex.prescription}</p>
                  ) : null}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {live && !session.exercises.length ? <p className="pt-2 text-[0.95rem] leading-relaxed text-ink-dim">No plan today. Add the first exercise.</p> : null}

      {live ? (
        <button onClick={() => setAdding(true)} className="mt-4 h-12 w-full rounded-xl border border-hairline-strong text-[1rem] text-ink">
          Add an exercise
        </button>
      ) : (
        <div className="mt-5 flex gap-2">
          <Link href={`/workouts${query}`} className="flex h-12 flex-1 items-center justify-center rounded-xl border border-hairline-strong text-[1rem] text-ink">
            Workouts
          </Link>
          <Link href="/today" className="flex h-12 flex-1 items-center justify-center rounded-xl border border-hairline-strong text-[1rem] text-ink">
            Home
          </Link>
        </div>
      )}

      {editing ? (
        <SetSheet
          key={editing.set.id}
          set={editing.set}
          ex={editing.ex}
          url={url}
          onClose={() => setEditing(null)}
          onDone={(w) => {
            setData(w);
            setEditing(null);
          }}
        />
      ) : null}
      {adding ? (
        <AddExerciseSheet
          have={new Set(session.exercises.map((e) => e.exercise.id))}
          onClose={() => setAdding(false)}
          onPick={(e) => {
            keep([...added.filter((id) => id !== e.id), e.id]);
            setPinned(e.id);
            setAdding(false);
          }}
        />
      ) : null}
      {finishing ? (
        <FinishSheet
          exercises={session.exercises}
          url={`/api/workout${query}`}
          onClose={() => setFinishing(false)}
          onDone={(w) => {
            keep([]);
            setData(w);
            setFinishing(false);
          }}
        />
      ) : null}
    </div>
  );
}
