"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { HealthDayView } from "@/lib/health/entries";
import type { FoodView } from "@/lib/health/foods";
import type { PendingItem, QuickResult } from "@/lib/health/quicklog";
import { canRecord, useRecorder } from "@/lib/health/useRecorder";
import { useHealthDay } from "./HealthDay";
import { Sheet } from "./Sheet";
import { NumberField, fmt } from "./fields";

async function post<T>(url: string, body: BodyInit, json = true): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: json ? { "Content-Type": "application/json" } : undefined,
    body,
  });
  const out = await res.json();
  if (!res.ok) throw new Error(out.error ?? "That didn't work");
  return out as T;
}

/**
 * Quick log's front end (healthspec.md §5.5), beside Add food in the dock on
 * Home. Hold to talk, release to send; a short tap opens a box to type the
 * same sentence instead. Typing is also the way in wherever
 * the mic isn't available, such as plain HTTP on the home network.
 *
 * A clear result is logged straight away with an undo. Anything the server
 * couldn't settle comes back as a question about that one item.
 */
export function QuickLog() {
  const { setDay, toast } = useHealthDay();
  const [busy, setBusy] = useState(false);
  const [typing, setTyping] = useState(false);
  const [asking, setAsking] = useState<QuickResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const handle = useCallback(
    (result: QuickResult) => {
      setDay(result.day);
      const ids = result.logged.map((l) => l.entryId);
      if (result.logged.length || !result.pending.length) {
        toast({
          text: result.intent === "log" ? `“${result.text}” · ${result.message}` : result.message,
          undo: ids.length
            ? async () => setDay(await post<HealthDayView>("/api/quick/undo", JSON.stringify({ ids })))
            : undefined,
        });
      }
      if (result.pending.length) setAsking(result);
    },
    [setDay, toast],
  );

  const send = useCallback(
    async (audio: Blob | null) => {
      if (!audio) {
        setTyping(true);
        return;
      }
      setBusy(true);
      setNotice(null);
      try {
        const form = new FormData();
        form.append("audio", audio, "clip");
        handle(await post<QuickResult>("/api/voice", form, false));
      } catch (err) {
        setNotice(err instanceof Error ? err.message : "That didn't work");
      } finally {
        setBusy(false);
      }
    },
    [handle],
  );

  const recorder = useRecorder(useCallback((audio: Blob | null) => void send(audio), [send]));
  const listening = recorder.state !== "idle";

  return (
    <>
      <button
        aria-label="Hold to log by voice, tap to type"
        disabled={busy}
        onPointerDown={(e) => {
          e.preventDefault();
          if (canRecord()) void recorder.start();
        }}
        onPointerUp={() => (canRecord() ? recorder.stop() : setTyping(true))}
        onPointerLeave={() => listening && recorder.stop()}
        onContextMenu={(e) => e.preventDefault()}
        className="flex h-16 w-[5.25rem] shrink-0 touch-none select-none flex-col items-center justify-center gap-0.5 rounded-xl border"
        style={{
          borderColor: listening ? "var(--ink-dim)" : "var(--hairline-strong)",
          background: listening ? "var(--hairline)" : "var(--ground-raised)",
          color: busy ? "var(--ink-faint)" : "var(--ink)",
          WebkitUserSelect: "none",
          WebkitTouchCallout: "none",
        }}
      >
        <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden>
          <rect x="9" y="3" width="6" height="11" rx="3" />
          <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" strokeLinecap="round" />
        </svg>
        {/* Says how it works, since nothing else about a mic does. */}
        <span className="text-[0.7rem] leading-none text-ink-dim">Hold to talk</span>
      </button>

      {listening || busy || notice || recorder.error ? createPortal(
        <div className="fixed inset-x-0 top-0 z-50 mx-auto max-w-2xl px-3" style={{ paddingTop: "calc(var(--safe-top) + 0.5rem)" }}>
          <div className="rounded-[10px] border border-hairline-strong bg-ground-raised px-4 py-3 text-[0.95rem]">
            {listening ? "Listening… release to send" : busy ? "Working it out…" : (recorder.error ?? notice)}
            {!listening && !busy ? (
              <button onClick={() => setNotice(null)} className="float-right text-ink-dim">
                OK
              </button>
            ) : null}
          </div>
        </div>,
        document.body,
      ) : null}

      {typing ? (
        <TypeSheet
          onClose={() => setTyping(false)}
          onResult={(r) => {
            setTyping(false);
            handle(r);
          }}
        />
      ) : null}
      {asking ? <AskSheet result={asking} onClose={() => setAsking(null)} /> : null}
    </>
  );
}

function TypeSheet({ onClose, onResult }: { onClose: () => void; onResult: (r: QuickResult) => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Sheet onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          setBusy(true);
          setError(null);
          try {
            onResult(await post<QuickResult>("/api/quick", JSON.stringify({ text })));
          } catch (err) {
            setError(err instanceof Error ? err.message : "That didn't work");
            setBusy(false);
          }
        }}
      >
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="just had 2 senbei and a coffee"
          className="w-full rounded-[10px] border border-hairline bg-ground-sunk px-3 py-2.5 text-[1rem] text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
        />
        <p className="pt-2 text-[0.85rem] text-ink-faint">
          Hold the mic to say it instead. &ldquo;Undo that&rdquo; and &ldquo;actually that was 2&rdquo; work too.
        </p>
        <button
          type="submit"
          disabled={busy || !text.trim()}
          className="mt-3 w-full rounded-[10px] border border-hairline-strong bg-ground-raised py-3 text-[1rem] text-ink disabled:text-ink-faint"
        >
          {busy ? "…" : "Log"}
        </button>
        {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
      </form>
    </Sheet>
  );
}

/**
 * The confirm sheet (§5.5): asks only about what couldn't be settled, one
 * item at a time. Every answer is remembered (the phrase as an alias, a
 * piece weight as a serving), so the same sentence won't ask twice.
 */
function AskSheet({ result, onClose }: { result: QuickResult; onClose: () => void }) {
  const [index, setIndex] = useState(0);
  const item = result.pending[index];
  const next = () => (index + 1 < result.pending.length ? setIndex(index + 1) : onClose());
  return (
    <Sheet onClose={onClose}>
      <p className="text-[0.85rem] text-ink-faint">
        &ldquo;{result.text}&rdquo;{result.pending.length > 1 ? ` · ${index + 1} of ${result.pending.length}` : ""}
      </p>
      {item ? <AskItem key={index} item={item} onDone={next} /> : null}
    </Sheet>
  );
}

function AskItem({ item, onDone }: { item: PendingItem; onDone: () => void }) {
  const { day: shown, setDay, toast } = useHealthDay();
  const [food, setFood] = useState<FoodView | null>(null);
  const [perPiece, setPerPiece] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState(false);

  async function resolve(foodId: number, gramsPerPiece?: number, who?: "me" | "both") {
    setBusy(true);
    setError(null);
    try {
      const { entry, day } = await post<{ entry: { id: number; name: string; macros: { kcal: number } }; day: HealthDayView }>(
        "/api/quick/resolve",
        JSON.stringify({
          phrase: item.phrase,
          foodId,
          quantity: item.quantity,
          unit: item.unit,
          minutesAgo: item.minutesAgo,
          gramsPerPiece,
          // For a question about who: the amount is already settled, and travels with the answer.
          grams: who ? (item.grams ?? undefined) : undefined,
          shared: item.shared,
          who: who ?? (item.who === "unstated" ? "me" : item.who),
        }),
      );
      setDay(day);
      toast({
        text: `Added ${entry.name} · ${entry.macros.kcal} kcal`,
        undo: async () => setDay(await post<HealthDayView>("/api/quick/undo", JSON.stringify({ ids: [entry.id] }))),
      });
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : "That didn't work";
      // A food picked from a tie can still need its piece weight.
      if (message === "How much was it?") await askWeight(foodId);
      else setError(message);
      setBusy(false);
    }
  }

  async function askWeight(foodId: number) {
    const res = await fetch(`/api/foods/${foodId}`);
    if (res.ok) setFood((await res.json()) as FoodView);
  }

  const needsWeightOf = item.reason === "needs_grams" ? (item.candidates[0]?.id ?? null) : null;
  useEffect(() => {
    if (needsWeightOf === null) return;
    let live = true;
    fetch(`/api/foods/${needsWeightOf}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((f) => live && f && setFood(f as FoodView));
    return () => {
      live = false;
    };
  }, [needsWeightOf]);

  if (food) {
    return (
      <div className="pt-2">
        <p className="text-[1.05rem] leading-snug">How much does one weigh?</p>
        <p className="pt-1 text-[0.85rem] text-ink-faint">
          {food.name}. Asked once; it&rsquo;s remembered after this.
        </p>
        {food.servings.length ? (
          <div className="flex flex-wrap gap-1.5 pt-3">
            {food.servings.map((s) => (
              <button
                key={s.label}
                disabled={busy}
                onClick={() => resolve(food.id, s.grams)}
                className="rounded-[10px] border border-hairline px-3 py-1.5 text-[0.9rem] text-ink-dim"
              >
                One is 1 {s.label} · {fmt(s.grams)}g
              </button>
            ))}
          </div>
        ) : null}
        <div className="flex items-end gap-2 pt-3">
          <div className="w-32">
            <NumberField label="Grams each" value={perPiece} onChange={setPerPiece} />
          </div>
          <button
            disabled={busy || !perPiece}
            onClick={() => perPiece && resolve(food.id, perPiece)}
            className="flex-1 rounded-[10px] border border-hairline-strong bg-ground-raised py-2.5 text-[0.95rem] text-ink disabled:text-ink-faint"
          >
            Log it
          </button>
        </div>
        {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
      </div>
    );
  }

  if (item.reason === "needs_grams") return <p className="pt-2 text-ink-dim">…</p>;

  // The sentence named no one (§5.7): never guessed, one tap either way.
  if (item.reason === "who" && item.candidates[0]) {
    const it = item.candidates[0];
    return (
      <div className="pt-2">
        <p className="text-[1.05rem] leading-snug">Who had the {it.name}?</p>
        <p className="pt-1 text-[0.85rem] text-ink-faint">{fmt(item.grams ?? 0, 0)}g in all.</p>
        <div className="flex gap-2 pt-4">
          <button
            disabled={busy}
            onClick={() => resolve(it.id, undefined, "both")}
            className="flex-1 rounded-[10px] border border-hairline-strong bg-ground-raised py-3 text-ink"
          >
            Split with {shown.partner.displayName}
          </button>
          <button
            disabled={busy}
            onClick={() => resolve(it.id, undefined, "me")}
            className="flex-1 rounded-[10px] border border-hairline-strong bg-ground-raised py-3 text-ink"
          >
            Only me
          </button>
        </div>
        {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
      </div>
    );
  }

  if (item.reason === "draft") {
    return (
      <div className="pt-2">
        <p className="text-[1.05rem] leading-snug">{item.candidates[0]?.name ?? item.phrase} is still waiting in Review.</p>
        <div className="flex gap-2 pt-4">
          <Link href="/review" onClick={onDone} className="flex-1 rounded-[10px] border border-hairline-strong bg-ground-raised py-3 text-center text-ink">
            Go to Review
          </Link>
          <button onClick={onDone} className="flex-1 rounded-[10px] border border-hairline py-3 text-ink-dim">
            Skip
          </button>
        </div>
      </div>
    );
  }

  if (item.reason === "ambiguous" && item.candidates.length) {
    return (
      <div className="pt-2">
        <p className="text-[1.05rem] leading-snug">Which {item.phrase}?</p>
        <div className="flex flex-col gap-1.5 pt-3">
          {item.candidates.map((c) => (
            <button
              key={c.id}
              disabled={busy}
              onClick={() => resolve(c.id)}
              className="rounded-[10px] border border-hairline px-3 py-2.5 text-left text-[0.95rem] text-ink"
            >
              {c.name}
              {c.nameJa ? <span className="text-ink-faint"> · {c.nameJa}</span> : null}
            </button>
          ))}
        </div>
        <button onClick={onDone} className="mt-3 w-full py-2 text-[0.9rem] text-ink-faint">
          None of these
        </button>
        {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
      </div>
    );
  }

  // Not in the library: look it up by name, and log it once it's confirmed.
  const grams = item.unit && ["g", "gram", "grams", "ml"].includes(item.unit) ? item.quantity : null;
  return (
    <div className="pt-2">
      {added ? (
        <>
          <p className="text-[1.05rem] leading-snug">Looking up &ldquo;{item.phrase}&rdquo;.</p>
          <p className="pt-2 text-[0.95rem] leading-relaxed text-ink-dim">
            Confirm it in Review and {grams ? `the ${fmt(grams, 0)}g` : "it"} will be logged then.
          </p>
          <button onClick={onDone} className="mt-4 w-full rounded-[10px] border border-hairline py-3 text-ink-dim">
            OK
          </button>
        </>
      ) : (
        <>
          <p className="text-[1.05rem] leading-snug">&ldquo;{item.phrase}&rdquo; isn&rsquo;t in the library yet.</p>
          <div className="flex gap-2 pt-4">
            <button
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await post("/api/foods", JSON.stringify({ name: item.phrase, grams }));
                  setAdded(true);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "That didn't work");
                } finally {
                  setBusy(false);
                }
              }}
              className="flex-1 rounded-[10px] border border-hairline-strong bg-ground-raised py-3 text-ink"
            >
              Add it by name
            </button>
            <button onClick={onDone} className="flex-1 rounded-[10px] border border-hairline py-3 text-ink-dim">
              Skip
            </button>
          </div>
          {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
        </>
      )}
    </div>
  );
}
