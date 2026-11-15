"use client";

import Link from "next/link";
import { useState } from "react";
import type { MaintenanceView, Profile } from "@/lib/health/maintenance";
import type { Macros } from "@/lib/health/reading";
import { useHealthDay } from "./HealthDay";

const whole = (n: number) => Math.round(n).toLocaleString("en-US");
/** "+0.15", "−0.4", "+165": a sign, and no zeros trailing after a decimal point. */
const signed = (n: number, places = 2) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${String(Number(Math.abs(n).toFixed(places)))}`;
const field =
  "h-11 w-full min-w-0 rounded-[10px] border border-hairline bg-ground-sunk px-3 text-[1rem] tabular-nums text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none";
const chipStyle = (on: boolean) => ({
  borderColor: on ? "var(--ink-dim)" : "var(--hairline)",
  color: on ? "var(--ink)" : "var(--ink-dim)",
  background: on ? "var(--ground-raised)" : "transparent",
});

async function post(body: unknown): Promise<MaintenanceView> {
  const res = await fetch("/api/maintenance", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "That didn't work");
  return json as MaintenanceView;
}

/** "a slow bulk of +0.15 kg a week", in the person's own terms. */
const goalWords = (kg: number) => (kg === 0 ? "holding your weight" : `${signed(kg)} kg a week`);

/**
 * The maintenance estimate under the weight trend (§6.3): the number and
 * how sure it is, what it is made of, and whether the standing target fits
 * the goal. A different target is only ever offered; setting it is a tap.
 */
export function MaintenanceBlock({ m, onChange }: { m: MaintenanceView; onChange: (m: MaintenanceView) => void }) {
  const { refresh } = useHealthDay();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = !m.profile.heightCm || !m.profile.birthYear || !m.profile.sex;

  async function approve() {
    setBusy(true);
    setError(null);
    try {
      onChange(await post({ action: "approve" }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-label="Maintenance" className="mt-5 rounded-xl border border-hairline bg-ground-raised px-3.5 py-3">
      <p className="text-[0.8rem] text-ink-faint">Maintenance, on a day without a run</p>
      {m.estimate !== null ? (
        <>
          <p className="pt-0.5 text-[1.35rem] tabular-nums">
            {whole(m.estimate)} <span className="text-[0.95rem] text-ink-dim">kcal · give or take {m.band}</span>
          </p>
          <p className="pt-1 text-[0.85rem] leading-relaxed text-ink-dim">
            {m.measured && m.formula !== null
              ? `${Math.round(m.share * 100)}% your log and scale (${whole(m.measured.kcal)} over ${m.measured.foodDays} days: eating ${whole(m.measured.intake)}, weight moving ${signed(m.measured.kgPerWeek)} kg a week), ${100 - Math.round(m.share * 100)}% the formula (${whole(m.formula)}).`
              : m.measured
                ? `From your log and scale: eating ${whole(m.measured.intake)} over ${m.measured.foodDays} days, weight moving ${signed(m.measured.kgPerWeek)} kg a week.`
                : `From the formula for now, at ${m.weightKg} kg. ${m.waiting ?? ""}`}
          </p>
          <p className="pt-2.5 text-[0.95rem] leading-relaxed">
            {m.target
              ? m.proposed
                ? `For ${goalWords(m.profile.goalKgWeek)}, that points to ${whole(m.proposed.kcal)} kcal. Your target is ${whole(m.target.kcal)}.`
                : `Your target of ${whole(m.target.kcal)} fits ${goalWords(m.profile.goalKgWeek)}.`
              : "You have no target yet. Set one in Settings."}
            {m.forecastKgWeek !== null ? (
              <span className="text-ink-dim">
                {" "}
                At {m.proposed ? "the current target" : "it"}, expect about {signed(m.forecastKgWeek)} kg a week.
              </span>
            ) : null}
          </p>
          {m.proposed ? (
            <button onClick={approve} disabled={busy} className="mt-2.5 h-11 w-full rounded-xl border border-hairline-strong text-[0.95rem] text-ink disabled:text-ink-faint">
              {busy ? "…" : `Set target to ${whole(m.proposed.kcal)} · carbs ${whole(m.proposed.carbs_g)}g`}
            </button>
          ) : null}
        </>
      ) : (
        <p className="pt-1 text-[0.95rem] leading-relaxed text-ink-dim">
          {missing
            ? "Add your height, birth year and sex in Settings for a first guess."
            : m.weightKg === null
              ? "Weigh in once, or give your weight in Settings, for a first guess."
              : (m.waiting ?? "Not enough to go on yet.")}
        </p>
      )}
      {error ? <p className="pt-2 text-[0.85rem] text-ink-dim">{error}</p> : null}
      <Link href="/settings" className="mt-2 inline-block text-[0.85rem] text-ink-dim underline decoration-hairline-strong underline-offset-4">
        Goal, body and target
      </Link>
    </section>
  );
}

const num = (s: string) => (s.trim() === "" || !Number.isFinite(Number(s)) ? null : Number(s));

/**
 * Settings: what the estimate starts from, the goal, and the target itself
 * (§6.1, §6.3). Each of us sets our own.
 */
export function BodySettings({ initial }: { initial: MaintenanceView }) {
  const [m, setM] = useState(initial);
  const [p, setP] = useState<Profile>(initial.profile);
  const [height, setHeight] = useState(initial.profile.heightCm ? String(initial.profile.heightCm) : "");
  const [born, setBorn] = useState(initial.profile.birthYear ? String(initial.profile.birthYear) : "");
  const [weight, setWeight] = useState(initial.profile.weightKg ? String(initial.profile.weightKg) : "");
  const [t, setT] = useState<Record<keyof Macros, string>>({
    kcal: initial.target ? String(initial.target.kcal) : "",
    protein_g: initial.target ? String(initial.target.protein_g) : "",
    fat_g: initial.target ? String(initial.target.fat_g) : "",
    carbs_g: initial.target ? String(initial.target.carbs_g) : "",
  });
  const [busy, setBusy] = useState<"profile" | "target" | null>(null);
  const [said, setSaid] = useState<{ where: "profile" | "target"; text: string } | null>(null);

  async function save(where: "profile" | "target", body: unknown, done: string) {
    setBusy(where);
    setSaid(null);
    try {
      setM(await post(body));
      setSaid({ where, text: done });
    } catch (err) {
      setSaid({ where, text: err instanceof Error ? err.message : "That didn't work" });
    } finally {
      setBusy(null);
    }
  }

  const macros = { kcal: num(t.kcal), protein_g: num(t.protein_g), fat_g: num(t.fat_g), carbs_g: num(t.carbs_g) };
  const fromMacros = macros.protein_g !== null && macros.fat_g !== null && macros.carbs_g !== null ? macros.protein_g * 4 + macros.fat_g * 9 + macros.carbs_g * 4 : null;
  const complete = Object.values(macros).every((v) => v !== null);
  const goalKcal = Math.round((p.goalKgWeek * 7700) / 7);

  return (
    <>
      <section className="pt-7">
        <h2 className="text-[1rem]">Body and goal</h2>
        <p className="pb-3 text-[0.85rem] text-ink-dim">What the maintenance estimate starts from. The weight here is only used until you&rsquo;ve weighed in.</p>
        <div className="grid grid-cols-3 gap-2">
          <label className="flex flex-col">
            <span className="pb-1 text-[0.8rem] text-ink-faint">Height, cm</span>
            <input aria-label="Height in centimetres" inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value.replace(/[^\d.]/g, ""))} className={field} />
          </label>
          <label className="flex flex-col">
            <span className="pb-1 text-[0.8rem] text-ink-faint">Born in</span>
            <input aria-label="Birth year" inputMode="numeric" value={born} onChange={(e) => setBorn(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="1990" className={field} />
          </label>
          <label className="flex flex-col">
            <span className="pb-1 text-[0.8rem] text-ink-faint">Weight, kg</span>
            <input aria-label="Weight in kilograms" inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^\d.]/g, ""))} className={field} />
          </label>
        </div>
        <div className="flex gap-1.5 pt-2.5">
          {(["male", "female"] as const).map((s) => (
            <button key={s} aria-pressed={p.sex === s} onClick={() => setP({ ...p, sex: s })} className="h-10 flex-1 rounded-full border text-[0.9rem]" style={chipStyle(p.sex === s)}>
              {s === "male" ? "Male" : "Female"}
            </button>
          ))}
        </div>
        <p className="pt-3 pb-1.5 text-[0.8rem] text-ink-faint">Day to day, apart from runs</p>
        <div className="flex gap-1.5">
          {(
            [
              [1.35, "Mostly sitting"],
              [1.5, "Lifting, some walking"],
              [1.7, "On my feet"],
            ] as const
          ).map(([a, label]) => (
            <button key={a} aria-pressed={p.activity === a} onClick={() => setP({ ...p, activity: a })} className="h-10 flex-1 rounded-full border px-1 text-[0.8rem]" style={chipStyle(p.activity === a)}>
              {label}
            </button>
          ))}
        </div>
        <p className="pt-3 pb-1.5 text-[0.8rem] text-ink-faint">Goal</p>
        <div className="flex items-center gap-3">
          <button aria-label="Slower gain or faster loss" onClick={() => setP({ ...p, goalKgWeek: Math.max(-1, Math.round((p.goalKgWeek - 0.05) * 100) / 100) })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[1.4rem] leading-none">
            −
          </button>
          <p className="min-w-0 flex-1 text-center">
            <span className="block text-[1.1rem] tabular-nums">{p.goalKgWeek === 0 ? "Hold" : `${signed(p.goalKgWeek)} kg a week`}</span>
            <span className="block text-[0.8rem] tabular-nums text-ink-dim">
              {p.goalKgWeek === 0 ? "eat at maintenance" : `about ${signed(goalKcal, 0)} kcal a day against maintenance`}
            </span>
          </p>
          <button aria-label="Faster gain or slower loss" onClick={() => setP({ ...p, goalKgWeek: Math.min(1, Math.round((p.goalKgWeek + 0.05) * 100) / 100) })} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[1.4rem] leading-none">
            +
          </button>
        </div>
        <button
          onClick={() => save("profile", { action: "profile", ...p, heightCm: num(height), birthYear: num(born), weightKg: num(weight) }, "Saved.")}
          disabled={busy !== null}
          className="mt-3 h-11 w-full rounded-xl border border-hairline-strong text-[0.95rem] text-ink disabled:text-ink-faint"
        >
          {busy === "profile" ? "…" : "Save body and goal"}
        </button>
        {said?.where === "profile" ? <p className="pt-2 text-[0.85rem] text-ink-dim">{said.text}</p> : null}
        <p className="pt-2 text-[0.85rem] leading-relaxed text-ink-dim">
          {m.estimate !== null
            ? `Maintenance is estimated at ${whole(m.estimate)} kcal, give or take ${m.band}. ${m.proposed ? `With this goal that points to a target of ${whole(m.proposed.kcal)}.` : "Your target fits this goal."}`
            : "The estimate appears once these are filled in and you've weighed in."}
        </p>
      </section>

      <section className="pt-7">
        <h2 className="text-[1rem]">Daily target</h2>
        <p className="pb-3 text-[0.85rem] text-ink-dim">From today on; days already past keep theirs. A run adds to it on the day.</p>
        <div className="grid grid-cols-4 gap-2">
          {(
            [
              ["kcal", "kcal"],
              ["protein_g", "Protein"],
              ["fat_g", "Fat"],
              ["carbs_g", "Carbs"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="flex flex-col">
              <span className="pb-1 text-[0.8rem] text-ink-faint">{label}</span>
              <input aria-label={label} inputMode="decimal" value={t[key]} onChange={(e) => setT({ ...t, [key]: e.target.value.replace(/[^\d.]/g, "") })} className={`${field} px-2`} />
            </label>
          ))}
        </div>
        {fromMacros !== null && macros.kcal !== null && Math.abs(fromMacros - macros.kcal) > 50 ? (
          <p className="pt-2 text-[0.85rem] text-ink-dim">
            Those macros add up to {whole(fromMacros)} kcal, not {whole(macros.kcal)}.
          </p>
        ) : null}
        <button
          onClick={() => save("target", { action: "target", ...macros }, "Target set from today.")}
          disabled={busy !== null || !complete}
          className="mt-3 h-11 w-full rounded-xl border border-hairline-strong text-[0.95rem] text-ink disabled:text-ink-faint"
        >
          {busy === "target" ? "…" : "Set target"}
        </button>
        {said?.where === "target" ? <p className="pt-2 text-[0.85rem] text-ink-dim">{said.text}</p> : null}
      </section>
    </>
  );
}
