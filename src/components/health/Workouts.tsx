"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ExerciseView } from "@/lib/health/plans";
import type { PastSession, RoutineCard, RoutineLine, SetView, WorkoutsView } from "@/lib/health/workout";
import { usePoll } from "@/lib/usePoll";
import { formatDay } from "@/lib/health/zone";
import { fmt } from "./fields";
import { SetSheet, WhoSwitch, loadText, send, setText, useWho } from "./Workout";

/** "3 × 8–12", "3 sets", or nothing when the plan only says it in words. */
function target(l: RoutineLine): string | null {
  const reps = l.repMin && l.repMax ? (l.repMin === l.repMax ? String(l.repMin) : `${l.repMin}–${l.repMax}`) : l.repMax ? String(l.repMax) : null;
  if (l.targetSets && reps) return `${l.targetSets} × ${reps}`;
  if (l.targetSets) return `${l.targetSets} sets`;
  return reps;
}

/** Sets at one load read as "40 × 12, 12, 11"; anything else set by set. */
function setsLine(sets: SetView[], e: ExerciseView): string {
  const work = sets.filter((s) => !s.warmup);
  if (!work.length) return "";
  const sameLoad = work.every((s) => s.loadKg === work[0].loadKg);
  return e.kind === "load_reps" && sameLoad && !(e.equipment === "bodyweight" && !work[0].loadKg)
    ? `${fmt(work[0].loadKg ?? 0, 2)} × ${work.map((s) => s.reps ?? 0).join(", ")}`
    : work.map((s) => setText(s, e)).join(", ");
}

function Routine({ r, open, onToggle, start }: { r: RoutineCard; open: boolean; onToggle: () => void; start: React.ReactNode }) {
  const count = r.blocks.reduce((n, b) => n + b.exercises.length, 0);
  return (
    <li className={`rounded-xl border ${open ? "border-hairline-strong bg-ground-raised" : "border-hairline"}`}>
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-baseline gap-2 px-3.5 py-3.5 text-left">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[1.1rem]">{r.name}</span>
          <span className="block text-[0.8rem] text-ink-faint">
            {[r.date ? "for today" : r.next ? "next up" : null, `${count} exercises`, r.lastDone ? `last done ${formatDay(r.lastDone)}` : "not done yet"]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-[0.9rem] text-ink-faint">
          {open ? "−" : "+"}
        </span>
      </button>
      {open ? (
        <div className="px-3.5 pb-3.5">
          {r.notes ? <p className="pb-2 text-[0.9rem] leading-relaxed text-ink-dim">{r.notes}</p> : null}
          {r.blocks.map((b, i) => (
            <div key={i}>
              {b.label || b.kind !== "straight" ? (
                <p className="pt-2 text-[0.8rem] text-ink-faint">{[b.label, b.kind === "straight" ? null : b.kind].filter(Boolean).join(" · ")}</p>
              ) : null}
              <ul>
                {b.exercises.map((l) => {
                  const load = l.exercise.kind === "load_reps" && l.suggestion.loadKg !== null ? loadText(l.suggestion.loadKg, l.exercise) : null;
                  const last = setsLine(l.last, l.exercise);
                  return (
                    <li key={l.exercise.id} className="border-t border-hairline py-2.5">
                      <div className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 text-[1rem] leading-snug">{l.exercise.name}</span>
                        <span className="shrink-0 text-[0.95rem] tabular-nums text-ink">{load}</span>
                      </div>
                      <p className="text-[0.85rem] tabular-nums text-ink-dim">
                        {/* The plan's own words, which say more than the numbers taken from them. */}
                        {[l.prescription || target(l), l.suggestion.note].filter(Boolean).join(" · ")}
                      </p>
                      <p className="text-[0.8rem] tabular-nums text-ink-faint">{last ? `Last: ${last} · ${formatDay(l.lastDate!)}` : "Not logged yet"}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
          {start}
        </div>
      ) : null}
    </li>
  );
}

function Past({ s, open, onToggle, onEdit }: { s: PastSession; open: boolean; onToggle: () => void; onEdit: (set: SetView, ex: ExerciseView) => void }) {
  const sets = s.exercises.reduce((n, e) => n + e.sets.filter((x) => !x.warmup).length, 0);
  return (
    <li className="border-b border-hairline">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-baseline gap-2 py-3 text-left">
        <span className="w-24 shrink-0 text-[0.95rem] text-ink-dim">{formatDay(s.date)}</span>
        <span className="min-w-0 flex-1 truncate text-[1rem]">{s.planName ?? "No plan"}</span>
        <span className="shrink-0 text-[0.85rem] tabular-nums text-ink-faint">
          {s.open ? "in progress · " : ""}
          {sets} {sets === 1 ? "set" : "sets"}
          {s.rating !== null ? ` · ${s.rating}/10` : ""}
        </span>
      </button>
      {open ? (
        <div className="pb-3">
          {s.note ? <p className="pb-2 text-[0.9rem] leading-relaxed text-ink-dim">{s.note}</p> : null}
          {s.exercises.map(({ exercise, sets }) => (
            <div key={exercise.id} className="pb-2.5">
              <p className="text-[0.95rem]">{exercise.name}</p>
              <div className="flex flex-wrap gap-1.5 pt-1.5">
                {sets.map((x) => (
                  <button
                    key={x.id}
                    onClick={() => onEdit(x, exercise)}
                    className={`rounded-full border border-hairline tabular-nums ${x.warmup ? "h-8 px-2.5 text-[0.8rem] text-ink-faint" : "h-9 px-3 text-[0.9rem] text-ink"}`}
                  >
                    {setText(x, exercise)}
                    {x.rir !== null ? <span className="text-ink-faint"> · {fmt(x.rir)} left</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <p className="text-[0.8rem] text-ink-faint">Tap a set to correct it.</p>
        </div>
      ) : null}
    </li>
  );
}

/**
 * Workouts (healthspec.md §8): one person's routines, each with the load it
 * would start at today and what was done last time, a way to start any of
 * them, and every session behind them. For yourself or, with the switch, for
 * your partner. Routines are written in a chat; this is where they are read.
 */
export function Workouts({ initial }: { initial: WorkoutsView }) {
  const router = useRouter();
  const slug = initial.workout.who.slug;
  const { other, query } = useWho(slug);
  const { data, refresh } = usePoll<WorkoutsView>(`/api/workouts${query}`, 20_000, initial);
  const { workout, routines, history } = data;
  const name = workout.who.displayName;
  const [openRoutine, setOpenRoutine] = useState<number | null>(routines.find((r) => r.next)?.id ?? null);
  const [openPast, setOpenPast] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ set: SetView; ex: ExerciseView } | null>(null);
  const [busy, setBusy] = useState<number | "none" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const session = workout.session;
  const live = Boolean(session?.open && !session.finished);

  async function start(planId: number | null) {
    setBusy(planId ?? "none");
    setError(null);
    try {
      await send(`/api/workout${query}`, "POST", { action: "start", planId });
      router.push(`/workout${query}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(null);
    }
  }
  const verb = workout.joinable ? "Join with" : "Start";

  return (
    <div className="px-5 pt-3 pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-[1.3rem]">Workouts</h1>
        <WhoSwitch slug={slug} path="/workouts" />
      </div>

      {live ? (
        <Link href={`/workout${query}`} className="mt-4 flex h-14 w-full items-center justify-center rounded-xl bg-ink text-[1.05rem] font-bold text-ground">
          Back to {other ? `${name}'s ` : ""}workout{session?.planName ? ` · ${session.planName}` : ""}
        </Link>
      ) : (
        <p className="pt-3 text-[0.95rem] leading-relaxed text-ink-dim">
          {workout.joinable
            ? `${workout.joinable.by} is training${workout.joinable.planName ? `: ${workout.joinable.planName}` : ""}. ${other ? name : "You"} can join.`
            : workout.trained
              ? `${other ? name : "You"} trained today${session?.planName ? `: ${session.planName}` : ""}.`
              : other
                ? `${name} hasn't trained today.`
                : "You haven't trained today."}
        </p>
      )}

      <h2 className="pt-6 pb-2 text-[0.8rem] text-ink-faint">{other ? `${name}'s routines` : "Routines"}</h2>
      <ul className="flex flex-col gap-2">
        {routines.map((r) => (
          <Routine
            key={r.id}
            r={r}
            open={openRoutine === r.id}
            onToggle={() => setOpenRoutine(openRoutine === r.id ? null : r.id)}
            start={
              live ? null : (
                <button
                  onClick={() => start(r.id)}
                  disabled={busy !== null}
                  className="mt-2 h-12 w-full rounded-xl bg-ink text-[1rem] font-bold text-ground disabled:opacity-50"
                >
                  {busy === r.id ? "…" : `${verb} ${r.name}`}
                </button>
              )
            }
          />
        ))}
      </ul>
      {!routines.length ? (
        <p className="text-[0.95rem] leading-relaxed text-ink-dim">No routines yet. They are written with Claude, and show up here once they are.</p>
      ) : null}
      {live ? null : (
        <button onClick={() => start(null)} disabled={busy !== null} className="mt-2 h-12 w-full rounded-xl border border-hairline-strong text-[1rem] text-ink disabled:text-ink-faint">
          {busy === "none" ? "…" : `${verb} no plan`}
        </button>
      )}
      {error ? <p className="pt-2 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}

      <h2 className="pt-7 pb-1 text-[0.8rem] text-ink-faint">History</h2>
      {history.length ? (
        <ul>
          {history.map((s) => (
            <Past key={s.id} s={s} open={openPast === s.id} onToggle={() => setOpenPast(openPast === s.id ? null : s.id)} onEdit={(set, ex) => setEditing({ set, ex })} />
          ))}
        </ul>
      ) : (
        <p className="text-[0.95rem] leading-relaxed text-ink-dim">Nothing logged yet.</p>
      )}

      <Link href="/today" className="mt-6 flex h-12 w-full items-center justify-center rounded-xl border border-hairline-strong text-[1rem] text-ink">
        Home
      </Link>

      {editing ? (
        <SetSheet
          key={editing.set.id}
          set={editing.set}
          ex={editing.ex}
          url={`/api/workout${query}`}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            void refresh();
          }}
        />
      ) : null}
    </div>
  );
}
