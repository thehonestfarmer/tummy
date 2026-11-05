"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { FoodView, LibraryView } from "@/lib/health/foods";
import type { HealthDayView, RecentFood } from "@/lib/health/entries";
import type { MealView } from "@/lib/health/meals";
import { useHealthDay } from "./HealthDay";
import { Sheet } from "./Sheet";
import { NumberField, TextField, fmt } from "./fields";

const fold = (s: string | null | undefined) => (s ?? "").normalize("NFKC").toLowerCase();

type Step = { kind: "search" } | { kind: "amount"; food: FoodView } | { kind: "manual" } | { kind: "asked"; name: string };

const button =
  "w-full rounded-[3px] border border-hairline-strong bg-ground-raised py-3 text-[1rem] text-ink disabled:text-ink-faint";

/**
 * The + Food sheet (§5.6): find a food in the library and say how much.
 * When it isn't there, ask for it by name, which goes through the food table
 * and the review queue, or type its numbers.
 */
export function FoodSheet({ onClose }: { onClose: () => void }) {
  const { day, setDay, toast } = useHealthDay();
  const [library, setLibrary] = useState<FoodView[] | null>(null);
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [meals, setMeals] = useState<MealView[]>([]);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<Step>({ kind: "search" });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch("/api/foods", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: LibraryView) => live && setLibrary(json.foods))
      .catch(() => live && setError("Couldn't load the library."));
    fetch("/api/recents", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: { recents: RecentFood[]; meals: MealView[] }) => {
        if (!live) return;
        setRecents(json.recents ?? []);
        setMeals(json.meals ?? []);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!library) return [];
    if (!q) return library;
    return library.filter((f) => [f.name, f.nameJa, f.brand, ...f.aliases].some((s) => fold(s).includes(q))).slice(0, 30);
  }, [library, query]);

  /** Undo removes exactly what was added, including the partner's half of a shared meal. */
  const undo = (ids: number[]) => async () => {
    const r = await fetch("/api/quick/undo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    });
    if (r.ok) setDay((await r.json()) as HealthDayView);
  };

  async function log(food: { id: number; name: string }, grams: number, partnerGrams?: number) {
    setError(null);
    const res = await fetch("/api/entries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foodId: food.id, grams, partnerGrams }),
    });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Couldn't log that");
      return;
    }
    const { entry, ids, day } = json as { entry: { macros: { kcal: number } }; ids: number[]; day: HealthDayView };
    setDay(day);
    onClose();
    toast({
      text: `Added ${food.name}${partnerGrams ? " for both of you" : ""} · ${entry.macros.kcal} kcal`,
      undo: undo(ids),
    });
  }

  async function logMeal(meal: MealView) {
    setError(null);
    const res = await fetch(`/api/meals/${meal.id}/log`, { method: "POST" });
    const json = await res.json();
    if (!res.ok) {
      setError(json.error ?? "Couldn't log that");
      return;
    }
    setDay(json.day as HealthDayView);
    onClose();
    toast({
      text: `Added ${meal.name}${meal.shared ? " for both of you" : ""} · ${meal.kcal} kcal`,
      undo: undo(json.ids as number[]),
    });
  }

  return (
    <Sheet onClose={onClose}>
      {step.kind === "search" ? (
        <>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="What did you eat?"
            className="w-full rounded-[3px] border border-hairline bg-ground-sunk px-3 py-2.5 text-[1rem] text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
          />
          <ul className="min-h-0 flex-1 overflow-y-auto pt-1">
            {!query.trim() && meals.length ? (
              <>
                <li className="pt-2 pb-1 text-[0.8rem] text-ink-faint">Meals</li>
                {meals.map((m) => (
                  <li key={`m${m.id}`} className="border-b border-hairline">
                    <button onClick={() => logMeal(m)} className="flex w-full items-baseline gap-2 py-2.5 text-left">
                      <span className="min-w-0 flex-1 truncate text-[1rem]">
                        {m.name}
                        {m.shared ? <span className="text-[0.85rem] text-ink-faint"> · both of you</span> : null}
                      </span>
                      <span className="shrink-0 text-[0.85rem] tabular-nums text-ink-faint">{m.kcal} kcal</span>
                    </button>
                  </li>
                ))}
              </>
            ) : null}
            {!query.trim() && recents.length ? (
              <>
                <li className="pt-2 pb-1 text-[0.8rem] text-ink-faint">Recent · tap to log the same again</li>
                {recents.map((r) => (
                  <li key={`r${r.foodId}`} className="border-b border-hairline">
                    <button
                      onClick={() => log({ id: r.foodId, name: r.name }, r.grams)}
                      className="flex w-full items-baseline gap-2 py-2.5 text-left"
                    >
                      <span className="min-w-0 flex-1 truncate text-[1rem]">{r.name}</span>
                      <span className="shrink-0 text-[0.85rem] tabular-nums text-ink-faint">
                        {fmt(r.grams, 0)}g · {r.kcal} kcal
                      </span>
                    </button>
                  </li>
                ))}
              </>
            ) : null}
            {!query.trim() && library?.length ? <li className="pt-2 pb-1 text-[0.8rem] text-ink-faint">All foods</li> : null}
            {library === null ? <li className="py-3 text-[0.95rem] text-ink-faint">Loading…</li> : null}
            {results.map((f) => (
              <li key={f.id} className="border-b border-hairline">
                <button onClick={() => setStep({ kind: "amount", food: f })} className="flex w-full items-baseline gap-2 py-2.5 text-left">
                  <span className="min-w-0 flex-1 truncate text-[1rem]">{f.name}</span>
                  {f.nameJa ? <span className="max-w-[35%] truncate text-[0.8rem] text-ink-faint">{f.nameJa}</span> : null}
                </button>
              </li>
            ))}
          </ul>
          <div className="grid gap-2 pt-3">
            {query.trim() ? (
              <button
                onClick={async () => {
                  const res = await fetch("/api/foods", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ name: query.trim(), grams: null }),
                  });
                  const json = await res.json();
                  if (!res.ok) setError(json.error ?? "Couldn't add that");
                  else setStep({ kind: "asked", name: query.trim() });
                }}
                className="rounded-[3px] border border-hairline py-2.5 text-[0.95rem] text-ink-dim"
              >
                Add &ldquo;{query.trim()}&rdquo; by name
              </button>
            ) : null}
            <div className="flex gap-2">
              <button
                onClick={() => setStep({ kind: "manual" })}
                className="flex-1 rounded-[3px] border border-hairline py-2.5 text-[0.9rem] text-ink-dim"
              >
                Type the numbers
              </button>
              <Link
                href="/add"
                onClick={onClose}
                className="flex-1 rounded-[3px] border border-hairline py-2.5 text-center text-[0.9rem] text-ink-dim"
              >
                Photograph a packet
              </Link>
            </div>
          </div>
        </>
      ) : step.kind === "amount" ? (
        <AmountStep
          food={step.food}
          partnerName={day.partner.displayName}
          onBack={() => setStep({ kind: "search" })}
          onLog={log}
        />
      ) : step.kind === "manual" ? (
        <ManualStep
          initialName={query.trim()}
          onBack={() => setStep({ kind: "search" })}
          onCreated={(food) => {
            setLibrary((l) => (l ? [food, ...l] : [food]));
            setStep({ kind: "amount", food });
          }}
        />
      ) : (
        <div>
          <p className="text-[1.05rem] leading-snug">Looking up &ldquo;{step.name}&rdquo;.</p>
          <p className="pt-2 text-[0.95rem] leading-relaxed text-ink-dim">
            It&rsquo;ll be in Review in a few seconds, with its values from the food table. Confirm it there, then log
            it from here.
          </p>
          <div className="flex gap-2 pt-4">
            <Link href="/review" onClick={onClose} className={`${button} text-center`}>
              Go to Review
            </Link>
            <button onClick={onClose} className="w-full rounded-[3px] border border-hairline py-3 text-[1rem] text-ink-dim">
              Done
            </button>
          </div>
        </div>
      )}
      {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </Sheet>
  );
}

/**
 * How much: a serving and a count, or grams. With "Both of us" on, the
 * amount is the total, split between you, 50/50 unless you change it (§5.7).
 * The kcal shown is a preview; the server does the real sum.
 */
function AmountStep({
  food,
  partnerName,
  onBack,
  onLog,
}: {
  food: FoodView;
  partnerName: string;
  onBack: () => void;
  onLog: (food: FoodView, grams: number, partnerGrams?: number) => Promise<void>;
}) {
  const start = food.defaultGrams ?? food.servings[0]?.grams ?? 100;
  const [grams, setGrams] = useState<number | null>(start);
  const [both, setBoth] = useState(false);
  const [mine, setMine] = useState<number | null>(null);
  const [version, setVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const round = (g: number) => Math.round(g * 10) / 10;
  const pick = (g: number) => {
    setGrams(round(g));
    setMine(null);
    setVersion((v) => v + 1);
  };
  const myShare = both ? (mine ?? (grams ? round(grams / 2) : null)) : grams;
  const theirShare = both && grams && myShare !== null ? round(Math.max(0, grams - myShare)) : null;
  const kcal = (g: number) => fmt((food.per100.kcal * g) / 100, 0);

  return (
    <div>
      <button onClick={onBack} className="text-[0.9rem] text-ink-dim">
        ← Back
      </button>
      <p className="pt-2 text-[1.05rem]">{food.name}</p>
      <p className="text-[0.85rem] text-ink-faint">
        {fmt(food.per100.kcal, 0)} kcal per 100g{food.nameJa ? ` · ${food.nameJa}` : ""}
      </p>

      {food.servings.length ? (
        <div className="flex flex-wrap gap-1.5 pt-4">
          {food.servings.flatMap((s) =>
            [1, 2, 3].map((n) => (
              <button
                key={`${s.label}-${n}`}
                onClick={() => pick(s.grams * n)}
                className="rounded-[3px] border border-hairline px-3 py-1.5 text-[0.9rem] text-ink-dim"
              >
                {n} {s.label}
                {n > 1 && !s.label.endsWith("s") ? "s" : ""}
              </button>
            )),
          )}
        </div>
      ) : null}

      <div className="flex items-end gap-3 pt-4">
        <div key={version} className="w-32">
          <NumberField
            label={both ? "Grams, both of you" : "Grams"}
            value={grams}
            onChange={(g) => {
              setGrams(g);
              setMine(null);
            }}
          />
        </div>
        <p className="pb-2 text-[0.95rem] tabular-nums text-ink-dim">
          {!both && grams ? `${kcal(grams)} kcal · ${fmt((food.per100.protein_g * grams) / 100)}g protein` : ""}
        </p>
      </div>

      <label className="flex items-center gap-2.5 pt-4 text-[0.95rem]">
        <input type="checkbox" checked={both} onChange={(e) => setBoth(e.target.checked)} className="h-4 w-4 accent-current" />
        Both of us
      </label>
      {both && grams ? (
        <div className="flex items-end gap-3 pt-3">
          <div key={`mine-${version}-${grams}`} className="w-32">
            <NumberField label="You" value={myShare} onChange={setMine} />
          </div>
          <p className="pb-2 text-[0.9rem] tabular-nums text-ink-dim">
            {myShare !== null ? `${kcal(myShare)} kcal` : ""} · {partnerName} {theirShare !== null ? `${fmt(theirShare)}g` : ""}
          </p>
        </div>
      ) : null}

      <button
        onClick={async () => {
          if (!grams || myShare === null) return;
          setBusy(true);
          await onLog(food, myShare, both ? (theirShare ?? 0) : undefined);
          setBusy(false);
        }}
        disabled={busy || !grams || myShare === null}
        className={`${button} mt-4`}
      >
        {busy ? "…" : both ? "Log for both of us" : "Log it"}
      </button>
    </div>
  );
}

/** Typed-in per-100g numbers (§5.2, item 4). The typist is the check, so it's confirmed straight away. */
function ManualStep({
  initialName,
  onBack,
  onCreated,
}: {
  initialName: string;
  onBack: () => void;
  onCreated: (food: FoodView) => void;
}) {
  const [name, setName] = useState(initialName);
  const [kcal, setKcal] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [carbs, setCarbs] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ready = name.trim() && kcal !== null && protein !== null && fat !== null && carbs !== null;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/foods/manual", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, kcal, protein_g: protein, fat_g: fat, carbs_g: carbs }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save");
      const food = await fetch(`/api/foods/${json.id}`).then((r) => r.json());
      onCreated(food as FoodView);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
      setBusy(false);
    }
  }

  return (
    <div>
      <button onClick={onBack} className="text-[0.9rem] text-ink-dim">
        ← Back
      </button>
      <div className="grid gap-3 pt-3">
        <TextField label="Name" value={name} onChange={setName} />
        <p className="text-[0.9rem] text-ink-dim">Per 100g</p>
        <div className="grid grid-cols-4 gap-2">
          <NumberField label="kcal" value={kcal} onChange={setKcal} />
          <NumberField label="Protein" value={protein} onChange={setProtein} />
          <NumberField label="Fat" value={fat} onChange={setFat} />
          <NumberField label="Carbs" value={carbs} onChange={setCarbs} />
        </div>
      </div>
      <button onClick={save} disabled={busy || !ready} className={`${button} mt-4`}>
        {busy ? "…" : "Add to the library"}
      </button>
      {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </div>
  );
}
