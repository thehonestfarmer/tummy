"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FoodView, LibraryView } from "@/lib/health/foods";
import type { HealthDayView, RecentFood } from "@/lib/health/entries";
import type { MealView } from "@/lib/health/meals";
import type { FridgeItem, FridgeView } from "@/lib/health/fridge";
import { prepare } from "@/lib/resize";
import { uploadFoodImage } from "@/lib/health/upload";
import { AmountStep } from "./AmountStep";
import { useHealthDay } from "./HealthDay";
import { ScanStep } from "./ScanStep";
import { Sheet } from "./Sheet";
import { fmt } from "./fields";

const fold = (s: string | null | undefined) => (s ?? "").normalize("NFKC").toLowerCase();

type Step =
  | { kind: "search" }
  | { kind: "amount"; food: FoodView }
  | { kind: "asked"; name: string }
  /** A label has been photographed; `draftId` is null until the photo has landed. */
  | { kind: "scan"; draftId: number | null };

/** One food waiting to be logged with others: what it is, how much for you, and how much for your partner. */
type Waiting = { id: number; name: string; grams: number; partnerGrams?: number; kcal: number };

const button =
  "w-full rounded-[10px] border border-hairline-strong bg-ground-raised py-3 text-[1rem] text-ink disabled:text-ink-faint";

/**
 * The + Food sheet (§5.6): find a food in the library and say how much.
 * When it isn't there: photograph its label, which opens the camera straight
 * away and comes back here to be confirmed and logged; ask for it by name,
 * which goes through the food table and the review queue. Several foods can
 * be gathered and logged in one go: "Add another food" on the amount step
 * keeps the first one waiting, in a list above the search box. There is no typing
 * numbers in here: a label is photographed, and a misread is fixed in Review.
 */
export function FoodSheet({ onClose }: { onClose: () => void }) {
  const { day, setDay, toast, date } = useHealthDay();
  const [library, setLibrary] = useState<FoodView[] | null>(null);
  const [recents, setRecents] = useState<RecentFood[]>([]);
  const [meals, setMeals] = useState<MealView[]>([]);
  const [fridge, setFridge] = useState<FridgeItem[]>([]);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState<Step>({ kind: "search" });
  // Foods chosen but not logged yet, when several are going in together.
  const [waiting, setWaiting] = useState<Waiting[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);

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
    fetch("/api/fridge", { cache: "no-store" })
      .then((r) => r.json())
      .then((json: FridgeView) => live && setFridge(json.items ?? []))
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

  /**
   * Logs one food or several. They go up one at a time, so if one fails the
   * ones before it are in the day and the rest are still waiting to be sent.
   */
  async function logAll(items: Omit<Waiting, "kcal">[]) {
    setError(null);
    setSending(true);
    const ids: number[] = [];
    let kcal = 0;
    let day: HealthDayView | null = null;
    let failed: string | null = null;
    let done = 0;
    for (const item of items) {
      try {
        const res = await fetch("/api/entries", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          // `date` is set only on a past day: something forgotten goes where it belongs.
          body: JSON.stringify({ foodId: item.id, grams: item.grams, partnerGrams: item.partnerGrams, date: date ?? undefined }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? `Couldn't log ${item.name}`);
        ids.push(...(json.ids as number[]));
        kcal += (json.entry as { macros: { kcal: number } }).macros.kcal;
        day = json.day as HealthDayView;
        done++;
      } catch (err) {
        failed = err instanceof Error ? err.message : `Couldn't log ${item.name}`;
        break;
      }
    }
    setSending(false);
    if (day) setDay(day);
    if (failed) {
      // Whatever went in is out of the list; whatever didn't is kept to try again.
      setWaiting(items.slice(done).map((i) => ({ ...i, kcal: waiting.find((w) => w.id === i.id)?.kcal ?? 0 })));
      setStep({ kind: "search" });
      setError(failed);
      return;
    }
    if (!day) return;
    const [only] = items;
    const whose = only.partnerGrams ? (only.grams ? " for both of you" : ` for ${day.partner.displayName}`) : "";
    onClose();
    toast({
      text: items.length === 1 ? `Added ${only.name}${whose} · ${kcal} kcal` : `Added ${items.length} foods · ${kcal} kcal`,
      undo: undo(ids),
    });
  }

  const log = (food: { id: number; name: string }, grams: number, partnerGrams?: number) =>
    logAll([...waiting.filter((w) => w.id !== food.id), { id: food.id, name: food.name, grams, partnerGrams }]);

  /** Keeps a food waiting and goes back for another. Choosing the same food again replaces its amount. */
  function hold(item: Waiting) {
    setWaiting((w) => [...w.filter((x) => x.id !== item.id), item]);
    setQuery("");
    setStep({ kind: "search" });
  }

  /** Into the fridge for later, not into anyone's day (§5.10). */
  async function stock(food: FoodView, grams: number) {
    setError(null);
    const res = await fetch("/api/fridge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ foodId: food.id, kind: "stocked", grams }),
    });
    if (!res.ok) {
      setError((await res.json().catch(() => ({}))).error ?? "Couldn't add that");
      return;
    }
    onClose();
    toast({ text: `${fmt(grams, 0)}g of ${food.name} is in the fridge.` });
  }

  /** The photo goes up and becomes a draft, read in the background; ScanStep waits for it. */
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    e.target.value = "";
    if (!raw) return;
    setError(null);
    setStep({ kind: "scan", draftId: null });
    try {
      const url = await uploadFoodImage(await prepare(raw));
      const res = await fetch("/api/foods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: [url] }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't send that photo");
      setStep({ kind: "scan", draftId: json.id as number });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that photo");
      setStep({ kind: "search" });
    }
  }

  /** A retake replaces the photo: the draft it made would otherwise sit in Review for nobody. */
  function retake(draftId: number | null) {
    // First, and synchronously: a phone only opens the camera from inside the tap itself.
    camera.current?.click();
    if (draftId === null) return;
    void fetch("/api/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "discard", id: draftId }),
    }).catch(() => {});
  }

  async function logMeal(meal: MealView) {
    setError(null);
    const res = await fetch(`/api/meals/${meal.id}/log`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date: date ?? undefined }),
    });
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
    <Sheet onClose={onClose} tall>
      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
      {step.kind === "search" ? (
        <>
          <ul className="flex min-h-0 flex-1 flex-col overflow-y-auto pt-1">
            {/* While searching, matches settle against the search box rather than the far end of the sheet. */}
            {query.trim() ? <li aria-hidden className="mt-auto" /> : null}
            {!query.trim() && meals.length && !waiting.length ? (
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
            {!query.trim() && fridge.length ? (
              <>
                <li className="pt-2 pb-1 text-[0.8rem] text-ink-faint">In the fridge</li>
                {fridge.map(({ food, left, count }) => (
                  <li key={`f${food.id}`} className="border-b border-hairline">
                    <button onClick={() => setStep({ kind: "amount", food })} className="flex w-full items-baseline gap-2 py-2.5 text-left">
                      <span className="min-w-0 flex-1 truncate text-[1rem]">{food.name}</span>
                      <span className="shrink-0 text-[0.85rem] tabular-nums text-ink-faint">
                        {count ? `${fmt(count.n)} left · ` : ""}
                        {fmt(left, 0)}g
                      </span>
                    </button>
                  </li>
                ))}
              </>
            ) : null}
            {!query.trim() && recents.length ? (
              <>
                <li className="pt-2 pb-1 text-[0.8rem] text-ink-faint">{waiting.length ? "Recent · tap to add the same again" : "Recent · tap to log the same again"}</li>
                {recents.map((r) => (
                  <li key={`r${r.foodId}`} className="border-b border-hairline">
                    <button
                      onClick={() =>
                        waiting.length
                          ? hold({ id: r.foodId, name: r.name, grams: r.grams, kcal: r.kcal })
                          : log({ id: r.foodId, name: r.name }, r.grams)
                      }
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
                className="rounded-[10px] border border-hairline py-2.5 text-[0.95rem] text-ink-dim"
              >
                Add &ldquo;{query.trim()}&rdquo; by name
              </button>
            ) : null}
            {waiting.length ? (
              <div className="rounded-xl border border-hairline bg-ground-raised px-3 pt-1 pb-3">
                <ul>
                  {waiting.map((w) => (
                    <li key={w.id} className="flex items-center gap-2 border-b border-hairline">
                      <span className="min-w-0 flex-1 truncate py-2 text-[0.95rem]">{w.name}</span>
                      <span className="shrink-0 text-[0.85rem] tabular-nums text-ink-dim">
                        {fmt(w.grams, 0)}g
                        {w.partnerGrams ? (w.partnerGrams === w.grams ? " each" : ` + ${fmt(w.partnerGrams, 0)}g`) : ""} · {w.kcal} kcal
                      </span>
                      <button
                        aria-label={`Take out ${w.name}`}
                        onClick={() => setWaiting(waiting.filter((x) => x.id !== w.id))}
                        className="-mr-2 flex h-10 w-10 shrink-0 items-center justify-center text-[1.2rem] text-ink-dim"
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => logAll(waiting)}
                  disabled={sending}
                  className="mt-3 h-12 w-full rounded-xl bg-ink text-[1.05rem] font-bold text-ground disabled:opacity-50"
                >
                  {sending
                    ? "…"
                    : `Log ${waiting.length === 1 ? "it" : `all ${waiting.length}`} · ${waiting.reduce((n, w) => n + w.kcal, 0)} kcal`}
                </button>
              </div>
            ) : null}
            {/* Search sits at the bottom, under the thumb, with the list above it. */}
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What did you eat?"
              className="w-full rounded-xl border border-hairline bg-ground-sunk h-12 px-3.5 text-[1rem] text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
            />
            <button
              onClick={() => camera.current?.click()}
              className="flex h-12 items-center justify-center gap-2 rounded-xl border border-hairline-strong bg-ground-raised text-[1rem] text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              Photograph a label
            </button>
          </div>
        </>
      ) : step.kind === "amount" ? (
        <AmountStep
          food={step.food}
          left={fridge.find((i) => i.food.id === step.food.id)?.left ?? null}
          me={day.me}
          partner={day.partner}
          onBack={() => setStep({ kind: "search" })}
          waiting={waiting.filter((w) => w.id !== step.food.id).length}
          onLog={log}
          onMore={(food, grams, partnerGrams) =>
            hold({ id: food.id, name: food.name, grams, partnerGrams, kcal: Math.round((food.per100.kcal * grams) / 100) })
          }
          onStock={stock}
        />
      ) : step.kind === "scan" ? (
        <ScanStep
          key={step.draftId ?? "sending"}
          draftId={step.draftId}
          onRetake={() => retake(step.draftId)}
          onClose={onClose}
          onFood={(food) => {
            setLibrary((l) => (l ? [food, ...l.filter((f) => f.id !== food.id)] : [food]));
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
            <button onClick={onClose} className="w-full rounded-[10px] border border-hairline py-3 text-[1rem] text-ink-dim">
              Done
            </button>
          </div>
        </div>
      )}
      {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </Sheet>
  );
}
