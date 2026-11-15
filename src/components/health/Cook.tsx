"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { DishView } from "@/lib/health/cook";
import type { FoodView, LibraryView } from "@/lib/health/foods";
import type { FridgeView } from "@/lib/health/fridge";
import { fold } from "@/lib/health/fold";
import { uploadFoodImage } from "@/lib/health/upload";
import { prepare } from "@/lib/resize";
import { useHealthDay } from "./HealthDay";
import { ScanStep } from "./ScanStep";
import { Sheet } from "./Sheet";
import { TableRows, useTableRows } from "./TableRows";
import { amountText, fmt, plural } from "./fields";

/** One ingredient: a food, and how much of it in one of its servings or in grams. */
type Line = { foodId: number; /** Null until chosen: the food's first serving, or grams. */ unit: number | null; count: string | null };
type Kept = { lines: Line[]; name: string; portions: string; cooked: string; step: "pick" | "dish" };

const STORE = "tummy-cook";
const round = (n: number) => Math.round(n * 10) / 10;
const numeric = (raw: string) => raw.replace(/[^\d.,]/g, "").replace(",", ".");
const stepButton = "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[1.3rem] leading-none";
const field =
  "h-12 w-full rounded-xl border border-hairline bg-ground-sunk px-3.5 text-[1rem] text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none";

/**
 * Cook (healthspec.md §5.12): several foods become one dish. Choose what went
 * in the pot and how much, say how many portions it made, and the dish goes
 * into the fridge while its ingredients leave. From then on a portion is
 * eaten, and split, like any other food.
 *
 * Two steps, so the list of ingredients has the whole screen: what went in,
 * then what came out. An ingredient that isn't one of our foods yet is added
 * without leaving: photograph its label, or look it up by name, confirm what
 * was read, and it is in the pot. The pot is kept for the life of the tab,
 * since taking a photo can reload the page on a phone short of memory.
 */
export function Cook() {
  const router = useRouter();
  const { toast } = useHealthDay();
  const [foods, setFoods] = useState<Map<number, FoodView> | null>(null);
  const [inFridge, setInFridge] = useState<Map<number, number>>(new Map());
  const [dishes, setDishes] = useState<DishView[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [step, setStep] = useState<"pick" | "dish">("pick");
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [portions, setPortions] = useState("2");
  const [cooked, setCooked] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const camera = useRef<HTMLInputElement>(null);
  /** A new ingredient being read: `draftId` is null until the photo has landed; `named` when it was asked for in words. */
  const [scan, setScan] = useState<{ draftId: number | null; named?: string } | null>(null);

  useEffect(() => {
    let live = true;
    const get = <T,>(url: string) => fetch(url, { cache: "no-store" }).then((r) => r.json() as Promise<T>);
    Promise.all([get<LibraryView>("/api/foods"), get<FridgeView>("/api/fridge"), get<{ dishes: DishView[] }>("/api/cook")])
      .then(([library, fridge, past]) => {
        if (!live) return;
        const have = new Map(library.foods.map((f) => [f.id, f]));
        setFoods(have);
        setInFridge(new Map(fridge.items.map((i) => [i.food.id, i.left])));
        setDishes(past.dishes ?? []);
        try {
          const kept = JSON.parse(sessionStorage.getItem(STORE) ?? "null") as Kept | null;
          if (!kept) return;
          const still = kept.lines.filter((l) => have.has(l.foodId));
          setLines(still);
          setName(kept.name);
          setPortions(kept.portions);
          setCooked(kept.cooked);
          setStep(still.length ? kept.step : "pick");
        } catch {
          // Nothing kept, or nothing readable: start a fresh pot.
        }
      })
      .catch(() => {
        if (!live) return;
        setFoods(new Map());
        setError("Couldn't load your foods. Check the connection and reload.");
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!foods) return;
    try {
      sessionStorage.setItem(STORE, JSON.stringify({ lines, name, portions, cooked, step } satisfies Kept));
    } catch {
      // Private mode: the pot just isn't kept across a reload.
    }
  }, [foods, lines, name, portions, cooked, step]);

  /** A line's amount: the unit it is counted in, the number as typed, and the grams that makes. */
  const amount = (line: Line, food: FoodView) => {
    const GRAMS = food.servings.length;
    const unit = line.unit ?? (food.servings.length ? 0 : GRAMS);
    const left = inFridge.get(food.id);
    // A pack of chicken goes in whole; a sack of rice doesn't.
    const each = unit === GRAMS ? 1 : food.servings[unit].grams;
    // One of it, but never more than the fridge holds: half a pack left is half a pack.
    const one = left && each > left ? Math.max(0.5, Math.round((left / each) * 2) / 2) : 1;
    const usual = unit === GRAMS ? (left && left <= 1000 ? Math.round(left) : (food.defaultGrams ?? 100)) : one;
    const text = line.count ?? String(usual);
    const n = Number(text);
    const ok = text !== "" && Number.isFinite(n) && n > 0;
    const grams = ok ? round(n * each) : 0;
    return { GRAMS, unit, text, n: ok ? n : 0, grams, by: unit === GRAMS ? 50 : 1 };
  };

  const patch = (foodId: number, change: Partial<Line>) => setLines((ls) => ls.map((l) => (l.foodId === foodId ? { ...l, ...change } : l)));
  const add = (foodId: number) => {
    setLines((ls) => (ls.some((l) => l.foodId === foodId) ? ls : [...ls, { foodId, unit: null, count: null }]));
    setQuery("");
  };
  const draft = async (body: { images: string[] } | { name: string }) => {
    const res = await fetch("/api/foods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error((json as { error?: string }).error ?? "That didn't work");
    return (json as { id: number }).id;
  };
  /** The photo goes up and becomes a draft, read in the background; ScanStep waits for it. */
  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0];
    e.target.value = "";
    if (!raw) return;
    setError(null);
    setScan({ draftId: null });
    try {
      const draftId = await draft({ images: [await uploadFoodImage(await prepare(raw))] });
      setScan({ draftId });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't send that photo");
      setScan(null);
    }
  }
  /** No label to photograph: the food table, or failing that an estimate, read the same way. */
  async function lookUp(named: string) {
    setError(null);
    setScan({ draftId: null, named });
    try {
      const draftId = await draft({ name: named });
      setScan({ draftId, named });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't look that up");
      setScan(null);
    }
  }
  /** A retake replaces the photo: the draft it made would otherwise sit in Review for nobody. */
  function retake(draftId: number | null) {
    // First, and synchronously: a phone only opens the camera from inside the tap itself.
    camera.current?.click();
    if (draftId === null) return;
    void fetch("/api/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "discard", id: draftId }) }).catch(() => {});
  }
  const again = (dish: DishView) => {
    setLines(dish.items.filter((i) => foods?.has(i.foodId)).map((i) => {
          const food = foods!.get(i.foodId)!;
          // Weighed foods come back in grams; one counted by the pack comes back in packs.
          return food.countedOnly && food.servings.length
            ? { foodId: i.foodId, unit: 0, count: String(round(i.grams / food.servings[0].grams)) }
            : { foodId: i.foodId, unit: food.servings.length, count: String(i.grams) };
        }),
    );
    setName(dish.name);
    setPortions(String(dish.portions));
    setCooked("");
  };

  const pot = lines.flatMap((line) => {
    const food = foods?.get(line.foodId);
    return food ? [{ line, food, a: amount(line, food) }] : [];
  });
  const ready = pot.filter((p) => p.a.grams > 0);
  const total = ready.reduce(
    (t, { food, a }) => ({
      grams: t.grams + a.grams,
      kcal: t.kcal + (food.per100.kcal * a.grams) / 100,
      protein: t.protein + (food.per100.protein_g * a.grams) / 100,
      fat: t.fat + (food.per100.fat_g * a.grams) / 100,
      carbs: t.carbs + (food.per100.carbs_g * a.grams) / 100,
    }),
    { grams: 0, kcal: 0, protein: 0, fat: 0, carbs: 0 },
  );
  const n = Number(portions);
  const made = portions !== "" && Number.isFinite(n) && n > 0 ? n : 0;
  const weighed = Number(cooked) > 0 ? Number(cooked) : null;
  const complete = ready.length > 0 && ready.length === pot.length;

  const q = fold(query.trim());
  const picked = new Set(lines.map((l) => l.foodId));
  const all = foods ? [...foods.values()].filter((f) => !picked.has(f.id)) : [];
  const found = q ? all.filter((f) => [f.name, f.nameJa, f.brand, ...f.aliases].some((s) => fold(s).includes(q))).slice(0, 6) : [];
  const stocked = all.filter((f) => inFridge.has(f.id));
  const tableRows = useTableRows(query, found).slice(0, 5);

  async function cook() {
    if (!complete || !made || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/cook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          portions: made,
          cookedGrams: weighed,
          items: ready.map(({ food, a }) => ({ foodId: food.id, grams: a.grams })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "That didn't work");
      sessionStorage.removeItem(STORE);
      toast({ text: `${name.trim()}: ${fmt(made)} ${plural("portion", made)} in the fridge.` });
      router.push("/library");
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  const sticky = "sticky -mx-5 border-t border-hairline bg-ground/95 px-5 pt-3 pb-3 backdrop-blur-sm";

  if (step === "dish") {
    return (
      <div className="flex min-h-[calc(100dvh-var(--bottom-chrome))] flex-col px-5 pt-3">
        <button onClick={() => setStep("pick")} className="h-9 self-start text-[0.9rem] text-ink-dim">
          ← Ingredients
        </button>
        <h1 className="pt-1 text-[1.15rem] leading-none">What did it make?</h1>
        <p className="pt-2 text-[0.9rem] leading-relaxed text-ink-dim">
          {ready.map(({ food, a }) => `${food.name} ${amountText(food, a.grams)}`).join(" · ")}
        </p>

        <div className="mt-auto flex flex-col gap-3 pt-6 pb-4">
          <label className="block">
            <span className="block pb-1 text-[0.8rem] text-ink-faint">Called</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Chicken curry" className={field} />
          </label>

          <div>
            <span className="block pb-1 text-[0.8rem] text-ink-faint">Portions it made</span>
            <div className="flex items-center gap-3">
              <button aria-label="Fewer portions" onClick={() => setPortions(String(Math.max(1, round(made - 1))))} disabled={made <= 1} className={stepButton}>
                −
              </button>
              <input
                aria-label="Portions"
                inputMode="decimal"
                value={portions}
                onChange={(e) => setPortions(numeric(e.target.value))}
                className="h-12 min-w-0 flex-1 rounded-xl border border-hairline bg-ground-sunk text-center text-[1.5rem] font-bold tabular-nums text-ink focus:outline-none"
              />
              <button aria-label="More portions" onClick={() => setPortions(String(round(made + 1)))} className={stepButton}>
                +
              </button>
            </div>
          </div>

          <label className="block">
            <span className="block pb-1 text-[0.8rem] text-ink-faint">Weighed after cooking, in grams (if you did)</span>
            <input inputMode="decimal" value={cooked} onChange={(e) => setCooked(numeric(e.target.value))} placeholder={`${fmt(total.grams, 0)} raw`} className={field} />
          </label>

          <div className="rounded-xl border border-hairline bg-ground-raised px-3.5 py-3">
            {made ? (
              <>
                <p className="text-[1.05rem] tabular-nums">
                  {fmt(total.kcal / made, 0)} kcal <span className="text-ink-dim">a portion</span>
                </p>
                <p className="pt-0.5 text-[0.85rem] tabular-nums text-ink-dim">
                  P {fmt(total.protein / made)} · F {fmt(total.fat / made)} · C {fmt(total.carbs / made)}
                  {weighed ? ` · about ${fmt(weighed / made, 0)}g each` : ""}
                </p>
                <p className="pt-0.5 text-[0.85rem] tabular-nums text-ink-faint">{fmt(total.kcal, 0)} kcal in the whole pot</p>
              </>
            ) : (
              <p className="text-[0.95rem] text-ink-dim">Say how many portions it made.</p>
            )}
          </div>
        </div>

        <div className={sticky} style={{ bottom: "var(--bottom-chrome)" }}>
          <button onClick={cook} disabled={busy || !made || !name.trim()} className="h-14 w-full rounded-xl bg-ink text-[1.05rem] font-bold text-ground disabled:opacity-50">
            {busy ? "…" : made ? `Put ${fmt(made)} ${plural("portion", made)} in the fridge` : "Put it in the fridge"}
          </button>
          {error ? <p className="pt-2 text-[0.85rem] text-ink-dim">{error}</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100dvh-var(--bottom-chrome))] flex-col px-5 pt-3">
      <h1 className="text-[1.15rem] leading-none">Cook</h1>
      <p className="pt-2 text-[0.95rem] leading-relaxed text-ink-dim">
        Choose what went in the pot, with its raw weight. The dish goes into the fridge in portions, and the ingredients
        come out.
      </p>

      {!lines.length && dishes.length ? (
        <>
          <p className="pt-5 pb-1 text-[0.8rem] text-ink-faint">Cooked before</p>
          <div className="flex flex-wrap gap-1.5">
            {dishes.map((d) => (
              <button key={d.foodId} onClick={() => again(d)} className="h-10 rounded-full border border-hairline px-3.5 text-[0.9rem] text-ink">
                {d.name}
              </button>
            ))}
          </div>
        </>
      ) : null}

      {pot.length ? (
        <ul className="flex flex-col gap-2.5 pt-4">
          {pot.map(({ food, a }) => (
            <li key={food.id} className="rounded-xl border border-hairline bg-ground-raised px-3 py-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[1.02rem] leading-snug">{food.name}</p>
                  <p className="text-[0.8rem] leading-snug text-ink-dim">
                    {fmt(food.per100.kcal, 0)} kcal {food.countedOnly ? `a ${food.servings[0]?.label ?? "pack"}` : "per 100g"}
                    {inFridge.has(food.id) ? ` · ${amountText(food, inFridge.get(food.id)!)} in the fridge` : " · not in the fridge"}
                  </p>
                </div>
                <button
                  aria-label={`Take ${food.name} out`}
                  onClick={() => setLines((ls) => ls.filter((l) => l.foodId !== food.id))}
                  className="-mt-2 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center text-[1.3rem] text-ink-dim"
                >
                  ×
                </button>
              </div>
              <div className="flex items-center gap-2 pt-3">
                <button aria-label="Less" onClick={() => patch(food.id, { unit: a.unit, count: String(Math.max(a.by, round(a.n - a.by))) })} className={stepButton}>
                  −
                </button>
                <input
                  aria-label={`How much ${food.name}`}
                  inputMode="decimal"
                  value={a.text}
                  onChange={(e) => patch(food.id, { unit: a.unit, count: numeric(e.target.value) })}
                  className="h-11 w-16 rounded-[10px] border border-hairline bg-ground-sunk text-center text-[1.15rem] font-bold tabular-nums text-ink focus:outline-none"
                />
                <button aria-label="More" onClick={() => patch(food.id, { unit: a.unit, count: String(round(a.n + a.by)) })} className={stepButton}>
                  +
                </button>
                {food.countedOnly && food.servings.length ? (
                  <span className="flex-1 text-[0.9rem] text-ink-dim">{plural(food.servings[0].label, a.n)}</span>
                ) : food.servings.length ? (
                  <select
                    aria-label="Counted in"
                    value={a.unit}
                    onChange={(e) => patch(food.id, { unit: Number(e.target.value), count: null })}
                    className="h-11 min-w-0 flex-1 rounded-[10px] border border-hairline bg-ground px-2 text-[0.9rem] text-ink"
                  >
                    {food.servings.map((sv, i) => (
                      <option key={sv.label} value={i}>
                        {plural(sv.label, 2)} · {fmt(sv.grams)}g
                      </option>
                    ))}
                    <option value={a.GRAMS}>grams</option>
                  </select>
                ) : (
                  <span className="flex-1 text-[0.9rem] text-ink-dim">grams</span>
                )}
                <span className="w-12 shrink-0 text-right text-[0.85rem] tabular-nums text-ink-dim">{a.grams && !food.countedOnly ? `${fmt(a.grams, 0)}g` : ""}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {!q && stocked.length ? (
        <>
          <p className="pt-5 pb-1 text-[0.8rem] text-ink-faint">In the fridge</p>
          <ul>
            {stocked.map((f) => (
              <li key={f.id} className="border-b border-hairline">
                <button onClick={() => add(f.id)} className="flex w-full items-baseline gap-2 py-3 text-left">
                  <span className="min-w-0 flex-1 truncate text-[1rem]">{f.name}</span>
                  <span className="shrink-0 text-[0.9rem] tabular-nums text-ink-dim">{amountText(f, inFridge.get(f.id)!)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {foods && !foods.size ? (
        <p className="pt-4 text-[0.95rem] leading-relaxed text-ink-dim">
          No foods yet.{" "}
          <Link href="/add" className="text-ink underline decoration-hairline-strong underline-offset-4">
            Stock up
          </Link>{" "}
          first, then cook from what you have.
        </p>
      ) : null}

      <div className={`${sticky} mt-auto`} style={{ bottom: "var(--bottom-chrome)" }}>
        {q ? (
          <ul className="pb-2">
            {found.map((f) => (
              <li key={f.id} className="border-b border-hairline">
                <button onClick={() => add(f.id)} className="flex w-full items-baseline gap-2 py-2.5 text-left">
                  <span className="min-w-0 flex-1 truncate text-[1rem]">{f.name}</span>
                  {f.nameJa ? <span className="max-w-[35%] truncate text-[0.8rem] text-ink-faint">{f.nameJa}</span> : null}
                </button>
              </li>
            ))}
            <TableRows
              rows={tableRows}
              onError={setError}
              onFood={(food) => {
                setFoods((have) => new Map(have).set(food.id, food));
                add(food.id);
              }}
            />
            {!found.length && !tableRows.length ? <li className="pt-2 text-[0.9rem] text-ink-dim">Nothing called that in your foods or the food table.</li> : null}
            <li className="flex gap-2 pt-2">
              <button
                onClick={() => camera.current?.click()}
                className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-hairline-strong bg-ground-raised text-[0.95rem] text-ink"
              >
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
                  <circle cx="12" cy="13" r="3.5" />
                </svg>
                Photograph label
              </button>
              <button onClick={() => lookUp(query.trim())} className="h-11 flex-1 rounded-xl border border-hairline-strong text-[0.95rem] text-ink">
                Look it up by name
              </button>
            </li>
          </ul>
        ) : null}
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Oil, sauce, anything else: type its name" className={field} />
        <button
          onClick={() => setStep("dish")}
          disabled={!complete}
          className="mt-2 h-14 w-full rounded-xl bg-ink text-[1.05rem] font-bold text-ground disabled:opacity-50"
        >
          {ready.length ? `Next · ${ready.length} in the pot · ${fmt(total.kcal, 0)} kcal` : "Next"}
        </button>
        {error ? <p className="pt-2 text-[0.85rem] text-ink-dim">{error}</p> : null}
      </div>

      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={onPhoto} className="hidden" />
      {scan ? (
        <Sheet onClose={() => setScan(null)}>
          <ScanStep
            key={scan.draftId ?? "sending"}
            draftId={scan.draftId}
            named={scan.named}
            onRetake={() => retake(scan.draftId)}
            onClose={() => setScan(null)}
            onFood={(food) => {
              setFoods((have) => new Map(have).set(food.id, food));
              add(food.id);
              setScan(null);
            }}
          />
        </Sheet>
      ) : null}
    </div>
  );
}
