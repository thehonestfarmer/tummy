"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DraftView, FoodView, LibraryView, ReviewView } from "@/lib/health/foods";
import type { Macros } from "@/lib/health/reading";
import {
  CROSS_CHECK_TOLERANCE,
  crossCheckGap,
  implausibility,
  normalize,
  PLAUSIBILITY_TOLERANCE,
  type Serving,
} from "@/lib/health/reading";
import { prepare } from "@/lib/resize";
import { uploadFoodImage } from "@/lib/health/upload";
import { useHealthDay } from "./HealthDay";
import { fmt } from "./fields";

/**
 * One thing bought. It is a photo or a name on its way to being read
 * (`draftId`, null until the photo has landed), or a food we already have
 * (`foodId`). `sameAs` is the answer to "is this one we already have?":
 * a food's id, null for "no, it's new", and undefined until someone says.
 */
type Line = {
  key: string;
  draftId: number | null;
  foodId: number | null;
  /** What to call it before it has been read. */
  label: string;
  thumb: string | null;
  sameAs?: number | null;
  /** Which unit the amount is in, and the amount as typed. Null is "the default". */
  unit: number | null;
  count: string | null;
  error: string | null;
};

type Seen =
  | { state: "sending" | "reading" }
  | { state: "failed"; why: string }
  | {
      state: "blocked" | "ok";
      name: string;
      per100: Macros | null;
      servings: Serving[];
      /** Where the numbers came from, in a few words. */
      from: string;
      warn: string | null;
      /** Foods this might already be, when nobody has said yet. */
      maybe: { id: number; name: string }[];
      isNew: boolean;
    };

const STORE = "tummy-stock-up";
const POLL_MS = 1500;
const fold = (s: string | null | undefined) => (s ?? "").normalize("NFKC").trim().toLowerCase();
const plural = (label: string, n: number) => (n === 1 || label.endsWith("s") ? label : `${label}s`);
const round = (n: number) => Math.round(n * 10) / 10;
let seq = 0;
const newKey = () => `${Date.now()}-${seq++}`;

const post = async (url: string, body: unknown) => {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "That didn't work");
  return json;
};

/**
 * Stock up (healthspec.md §5.10): the whole shop into the fridge in one
 * sitting. Photograph each label and keep going; nothing waits on a read.
 * Food bought before is found by name and only needs its amount. Each line
 * shows what was read, so the one button at the bottom is also the yes to
 * every new food on the list (§5.9).
 *
 * The list is kept for the life of the tab: taking a photo can reload the
 * page on a phone short of memory, and a trip to Review to fix a misread
 * should come back to the same shop.
 */
export function StockUp() {
  const router = useRouter();
  const { toast } = useHealthDay();
  const camera = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  const [lines, setLines] = useState<Line[] | null>(null);
  const [foods, setFoods] = useState<Map<number, FoodView>>(new Map());
  const [drafts, setDrafts] = useState<Map<number, DraftView>>(new Map());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = useCallback(
    (key: string, change: Partial<Line>) => setLines((ls) => (ls ?? []).map((l) => (l.key === key ? { ...l, ...change } : l))),
    [],
  );

  // The catalogue and the drafts first, then whatever shop was under way.
  useEffect(() => {
    let live = true;
    Promise.all([
      fetch("/api/foods", { cache: "no-store" }).then((r) => r.json() as Promise<LibraryView>),
      fetch("/api/review", { cache: "no-store" }).then((r) => r.json() as Promise<ReviewView>),
    ])
      .then(([library, review]) => {
        if (!live) return;
        const have = new Map(library.foods.map((f) => [f.id, f]));
        const waiting = new Map(review.drafts.map((d) => [d.id, d]));
        let kept: Line[] = [];
        try {
          kept = JSON.parse(sessionStorage.getItem(STORE) ?? "[]") as Line[];
        } catch {
          // Nothing kept, or nothing readable: start a fresh shop.
        }
        setFoods(have);
        setDrafts(waiting);
        setLines(
          kept.flatMap((l): Line[] => {
            const line = { ...l, thumb: null, error: null };
            if (l.foodId !== null) return have.has(l.foodId) ? [line] : [];
            if (l.draftId === null) return [];
            if (waiting.has(l.draftId)) return [line];
            // Confirmed in Review while we were away: it is a food now, under the same id.
            return have.has(l.draftId) ? [{ ...line, foodId: l.draftId, draftId: null }] : [];
          }),
        );
      })
      .catch(() => {
        if (!live) return;
        setLines([]);
        setError("Couldn't load your foods. Check the connection and reload.");
      });
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (lines === null) return;
    try {
      sessionStorage.setItem(STORE, JSON.stringify(lines.filter((l) => l.draftId !== null || l.foodId !== null)));
    } catch {
      // A full or blocked store only costs the list on a reload.
    }
  }, [lines]);

  const see = useCallback(
    (line: Line): Seen => {
      const food = line.foodId !== null ? foods.get(line.foodId) : undefined;
      if (food) {
        return { state: "ok", name: food.name, per100: food.per100, servings: food.servings, from: "bought before", warn: null, maybe: [], isNew: false };
      }
      if (line.error && line.draftId === null) return { state: "failed", why: line.error };
      if (line.draftId === null) return { state: "sending" };
      const draft = drafts.get(line.draftId);
      if (!draft || draft.state === "reading") return { state: "reading" };
      const reading = draft.reading;
      if (draft.state === "failed" || !reading) return { state: "failed", why: draft.error ?? "Couldn't read that one." };

      // Offered as a guess, and taken for granted only when the name is the very same.
      const exact = draft.matches.find((m) => [reading.name, reading.name_ja].some((n) => n && fold(n) === fold(m.name)));
      const sameAs = line.sameAs !== undefined ? line.sameAs : (exact?.id ?? null);
      const same = sameAs !== null ? foods.get(sameAs) : undefined;
      if (same) {
        return { state: "ok", name: same.name, per100: same.per100, servings: same.servings, from: "one we already have", warn: null, maybe: [], isNew: false };
      }

      const n = normalize(reading);
      const label = reading.kind === "nutrition_label";
      const off = n.per100 ? implausibility(n.per100) : null;
      const gap = label && draft.reference && n.per100 ? crossCheckGap(n.per100, draft.reference) : null;
      const warn =
        n.problems[0] ??
        (gap !== null && gap > CROSS_CHECK_TOLERANCE
          ? `Reads very differently from typical ${draft.reference!.name}. Check it against the packet.`
          : off !== null && off > PLAUSIBILITY_TOLERANCE
            ? "The calories don't add up from the macros. Worth a second look."
            : null);
      return {
        state: n.problems.length || draft.checking ? "blocked" : "ok",
        name: reading.name || line.label,
        per100: n.per100,
        servings: n.servings,
        from: draft.checking
          ? "checking against typical values…"
          : label
            ? "from the label"
            : draft.reference
              ? `food table: ${draft.reference.name}`
              : "an estimate, no table row matched",
        warn,
        maybe: line.sameAs === undefined ? draft.matches.filter((m) => foods.has(m.id)) : [],
        isNew: true,
      };
    },
    [drafts, foods],
  );

  /** The amount a line stands for: its unit, what is typed, and the grams that comes to. */
  const amount = (line: Line, servings: Serving[]) => {
    const GRAMS = servings.length;
    const unit = line.unit !== null && line.unit <= GRAMS ? line.unit : servings.length ? 0 : GRAMS;
    const text = line.count ?? (unit === GRAMS ? "" : "1");
    const n = Number(text);
    const each = unit === GRAMS ? 1 : servings[unit].grams;
    return { GRAMS, unit, text, n: Number.isFinite(n) ? n : 0, grams: text !== "" && Number.isFinite(n) && n > 0 ? round(n * each) : null };
  };

  const seen = useMemo(() => (lines ?? []).map((line) => ({ line, s: see(line) })), [lines, see]);
  const unsettled = seen.some(({ line, s }) => line.draftId !== null && (s.state === "reading" || (s.state === "blocked" && s.from.startsWith("checking"))));

  useEffect(() => {
    if (!unsettled) return;
    const look = async () => {
      try {
        const res = await fetch("/api/review", { cache: "no-store" });
        if (res.ok) setDrafts(new Map(((await res.json()) as ReviewView).drafts.map((d) => [d.id, d])));
      } catch {
        // Offline for a moment; the next look catches up.
      }
    };
    const timer = setInterval(look, POLL_MS);
    return () => clearInterval(timer);
  }, [unsettled]);

  /** Each photo is its own packet. It appears in the list at once and is read in the background. */
  async function onPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    setError(null);
    const fresh = picked.map((raw): Line => ({
      key: newKey(),
      draftId: null,
      foodId: null,
      label: "Photo",
      thumb: URL.createObjectURL(raw),
      unit: null,
      count: null,
      error: null,
    }));
    setLines((ls) => [...(ls ?? []), ...fresh]);
    // One at a time: a canvas per 12MP photo, several deep, is how a phone runs out of memory.
    for (const [i, raw] of picked.entries()) {
      try {
        const url = await uploadFoodImage(await prepare(raw));
        const { id } = (await post("/api/foods", { images: [url] })) as { id: number };
        patch(fresh[i].key, { draftId: id });
      } catch (err) {
        patch(fresh[i].key, { error: err instanceof Error ? err.message : "Couldn't send that photo." });
      }
    }
  }

  const add = (line: Omit<Line, "key" | "thumb" | "unit" | "count" | "error">) => {
    setLines((ls) => [...(ls ?? []), { ...line, key: newKey(), thumb: null, unit: null, count: null, error: null }]);
    setQuery("");
  };

  /** Food with no label, such as fish: looked up in the food table by its name (§5.8). */
  async function lookUp(name: string) {
    setError(null);
    try {
      const { id } = (await post("/api/foods", { name })) as { id: number };
      add({ draftId: id, foodId: null, label: name });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't look that up.");
    }
  }

  function remove(line: Line) {
    setLines((ls) => (ls ?? []).filter((l) => l.key !== line.key));
    if (line.thumb) URL.revokeObjectURL(line.thumb);
    // A draft nobody wants would otherwise sit in Review for good.
    if (line.draftId !== null) void post("/api/review", { action: "discard", id: line.draftId }).catch(() => {});
  }

  const ready = seen.flatMap(({ line, s }) => {
    if (s.state !== "ok") return [];
    const a = amount(line, s.servings);
    return a.grams ? [{ line, grams: a.grams, name: s.name }] : [];
  });

  /** Every line that is ready: made a food if it is new, then stocked. The rest stay on the list. */
  async function stockAll() {
    setBusy(true);
    setError(null);
    let done = 0;
    for (const { line, grams } of ready) {
      try {
        let foodId = line.foodId;
        if (foodId === null) {
          const draft = drafts.get(line.draftId!)!;
          const exact = draft.matches.find((m) => [draft.reading?.name, draft.reading?.name_ja].some((n) => n && fold(n) === fold(m.name)));
          const sameAs = line.sameAs !== undefined ? line.sameAs : (exact?.id ?? null);
          if (sameAs !== null && foods.has(sameAs)) {
            await post("/api/review", { action: "merge", id: draft.id, into: sameAs });
            foodId = sameAs;
          } else {
            await post("/api/review", { action: "confirm", id: draft.id, reading: draft.reading, reference: draft.reference?.id ?? null });
            foodId = draft.id;
            const made = await fetch(`/api/foods/${foodId}`, { cache: "no-store" });
            if (made.ok) {
              const food = (await made.json()) as FoodView;
              setFoods((f) => new Map(f).set(food.id, food));
            }
          }
          // From here it is a food, so a failed stock below is retried without confirming twice.
          patch(line.key, { foodId, draftId: null });
        }
        await post("/api/fridge", { foodId, kind: "stocked", grams });
        setLines((ls) => (ls ?? []).filter((l) => l.key !== line.key));
        done++;
      } catch (err) {
        patch(line.key, { error: err instanceof Error ? err.message : "That one didn't go in." });
      }
    }
    setBusy(false);
    if (!done) return;
    toast({ text: `${done} ${done === 1 ? "food is" : "foods are"} in the fridge.` });
    if (done === (lines ?? []).length) {
      sessionStorage.removeItem(STORE);
      router.push("/library");
    }
  }

  const q = fold(query);
  const found = q
    ? [...foods.values()]
        .filter((f) => [f.name, f.nameJa, f.brand, ...f.aliases].some((s) => fold(s).includes(q)))
        .filter((f) => !(lines ?? []).some((l) => l.foodId === f.id))
        .slice(0, 5)
    : [];

  return (
    <div className="px-5 pt-3">
      <h1 className="text-[1.15rem] leading-none">Stock up</h1>
      <p className="pt-2 text-[0.95rem] leading-relaxed text-ink-dim">
        Photograph each nutrition label, one after another, or find food you&rsquo;ve bought before. Say how many, then
        put it all in the fridge.
      </p>

      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={onPhotos} className="hidden" />
      <input ref={photos} type="file" accept="image/*" multiple onChange={onPhotos} className="hidden" />

      <ul className="flex flex-col gap-2.5 pt-4 pb-4">
        {seen.map(({ line, s }) => {
          const known = s.state === "ok" || s.state === "blocked" ? s : null;
          const a = known ? amount(line, known.servings) : null;
          return (
            <li key={line.key} className="rounded-xl border border-hairline bg-ground-raised px-3 py-3">
              <div className="flex items-start gap-3">
                {line.thumb || (line.draftId !== null && drafts.get(line.draftId)?.images[0]) ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={line.thumb ?? drafts.get(line.draftId!)!.images[0]}
                    alt=""
                    className="h-12 w-12 shrink-0 rounded-[8px] border border-hairline object-cover"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  {known ? (
                    <>
                      <p className="truncate text-[1.02rem] leading-snug">{known.name}</p>
                      <p className="text-[0.8rem] leading-snug text-ink-dim">
                        {known.per100
                          ? `${fmt(known.per100.kcal, 0)} kcal · P ${fmt(known.per100.protein_g)} · F ${fmt(known.per100.fat_g)} · C ${fmt(known.per100.carbs_g)} per 100g · `
                          : ""}
                        {known.from}
                      </p>
                    </>
                  ) : s.state === "failed" ? (
                    <>
                      <p className="text-[1.02rem] leading-snug">Couldn&rsquo;t read this one</p>
                      <p className="text-[0.8rem] leading-snug text-ink-dim">{s.why} Take it out and photograph it again.</p>
                    </>
                  ) : (
                    <p className="verifying pt-3 text-[0.95rem] text-ink-dim">
                      <span>{s.state === "sending" ? "Sending the photo…" : line.label === "Photo" ? "Reading the label…" : `Looking up ${line.label}…`}</span>
                    </p>
                  )}
                </div>
                <button
                  aria-label="Take this off the list"
                  onClick={() => remove(line)}
                  disabled={busy}
                  className="-mt-2 -mr-2 flex h-10 w-10 shrink-0 items-center justify-center text-[1.3rem] text-ink-dim"
                >
                  ×
                </button>
              </div>

              {known?.maybe.length ? (
                <div className="flex flex-wrap gap-1.5 pt-2.5">
                  {known.maybe.map((m) => (
                    <button
                      key={m.id}
                      onClick={() => patch(line.key, { sameAs: m.id, unit: null, count: null })}
                      className="h-9 rounded-full border border-hairline px-3 text-[0.85rem] text-ink"
                    >
                      It&rsquo;s the {m.name} we have
                    </button>
                  ))}
                  <button onClick={() => patch(line.key, { sameAs: null })} className="h-9 rounded-full border border-hairline px-3 text-[0.85rem] text-ink-dim">
                    It&rsquo;s new
                  </button>
                </div>
              ) : null}

              {known && a ? (
                <div className="flex items-center gap-2 pt-3">
                  <button
                    aria-label="Fewer"
                    onClick={() => patch(line.key, { unit: a.unit, count: String(Math.max(a.unit === a.GRAMS ? 50 : 1, round(a.n - (a.unit === a.GRAMS ? 50 : 1)))) })}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[1.3rem] leading-none"
                  >
                    −
                  </button>
                  <input
                    aria-label={`How much ${known.name}`}
                    inputMode="decimal"
                    value={a.text}
                    placeholder={a.unit === a.GRAMS ? "grams" : ""}
                    onChange={(e) => patch(line.key, { unit: a.unit, count: e.target.value.replace(/[^\d.,]/g, "").replace(",", ".") })}
                    className="h-11 w-14 rounded-[10px] border border-hairline bg-ground-sunk text-center text-[1.15rem] font-bold tabular-nums text-ink placeholder:text-[0.85rem] placeholder:font-normal placeholder:text-ink-faint focus:outline-none"
                  />
                  <button
                    aria-label="More"
                    onClick={() => patch(line.key, { unit: a.unit, count: String(round(a.n + (a.unit === a.GRAMS ? 50 : 1))) })}
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[1.3rem] leading-none"
                  >
                    +
                  </button>
                  {known.servings.length ? (
                    <select
                      aria-label="Counted in"
                      value={a.unit}
                      onChange={(e) => patch(line.key, { unit: Number(e.target.value), count: null })}
                      className="h-11 min-w-0 flex-1 rounded-[10px] border border-hairline bg-ground px-2 text-[0.9rem] text-ink"
                    >
                      {known.servings.map((sv, i) => (
                        <option key={sv.label} value={i}>
                          {plural(sv.label, 2)} · {fmt(sv.grams)}g
                        </option>
                      ))}
                      <option value={a.GRAMS}>grams</option>
                    </select>
                  ) : (
                    <span className="flex-1 text-[0.9rem] text-ink-dim">grams</span>
                  )}
                  <span className="w-12 shrink-0 text-right text-[0.85rem] tabular-nums text-ink-dim">{a.grams ? `${fmt(a.grams, 0)}g` : ""}</span>
                </div>
              ) : null}

              {known?.warn ? (
                <p className="pt-2 text-[0.85rem] leading-relaxed">
                  {known.warn}{" "}
                  {known.isNew ? (
                    <Link href="/review" className="underline decoration-hairline-strong underline-offset-4">
                      Fix the numbers
                    </Link>
                  ) : null}
                </p>
              ) : null}
              {line.error && known ? <p className="pt-2 text-[0.85rem] text-ink-dim">{line.error}</p> : null}
            </li>
          );
        })}
      </ul>

      {lines !== null && !lines.length ? (
        <p className="pb-4 text-[0.95rem] leading-relaxed text-ink-dim">Nothing on the list yet.</p>
      ) : null}

      {/* The actions stay within reach of a thumb, above whatever chrome is at the bottom. */}
      <div className="sticky -mx-5 border-t border-hairline bg-ground/95 px-5 pt-3 pb-3 backdrop-blur-sm" style={{ bottom: "var(--bottom-chrome)" }}>
        {found.length || q ? (
          <ul className="pb-2">
            {found.map((f) => (
              <li key={f.id} className="border-b border-hairline">
                <button onClick={() => add({ draftId: null, foodId: f.id, label: f.name })} className="flex w-full items-baseline gap-2 py-2.5 text-left">
                  <span className="min-w-0 flex-1 truncate text-[1rem]">{f.name}</span>
                  {f.nameJa ? <span className="max-w-[35%] truncate text-[0.8rem] text-ink-faint">{f.nameJa}</span> : null}
                </button>
              </li>
            ))}
            <li>
              <button onClick={() => lookUp(query.trim())} className="w-full py-2.5 text-left text-[0.95rem] text-ink-dim">
                Look up &ldquo;{query.trim()}&rdquo; in the food table
              </button>
            </li>
          </ul>
        ) : null}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Bought before, or no label? Type its name"
          className="h-12 w-full rounded-xl border border-hairline bg-ground-sunk px-3.5 text-[1rem] text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
        />
        <div className="flex gap-2 pt-2">
          <button
            onClick={() => camera.current?.click()}
            disabled={busy}
            className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl border border-hairline-strong bg-ground-raised text-[1rem] text-ink"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 8h3l1.5-2h7L17 8h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            {lines?.length ? "Another label" : "Photograph a label"}
          </button>
          {ready.length ? (
            <button onClick={stockAll} disabled={busy} className="h-14 flex-1 rounded-xl bg-ink text-[1.05rem] font-bold text-ground disabled:opacity-50">
              {busy ? "…" : `Put ${ready.length} in the fridge`}
            </button>
          ) : null}
        </div>
        <p className="flex h-8 items-end justify-between text-[0.8rem] text-ink-dim">
          <span>
            {lines && lines.length > ready.length
              ? `${lines.length - ready.length} not ready: still being read, or ${lines.length - ready.length === 1 ? "it needs" : "they need"} an amount.`
              : ""}
          </span>
          <button onClick={() => photos.current?.click()} disabled={busy} className="shrink-0 pl-3 underline decoration-hairline-strong underline-offset-4">
            Choose photos
          </button>
        </p>
        {error ? <p className="pt-1 text-[0.85rem] text-ink-dim">{error}</p> : null}
      </div>
    </div>
  );
}
