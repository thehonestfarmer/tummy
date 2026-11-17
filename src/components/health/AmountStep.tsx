"use client";

import { useState } from "react";
import type { DaySide } from "@/lib/health/entries";
import type { FoodView } from "@/lib/health/foods";
import { NOTHING, WORD, fit, of, roomFor } from "@/lib/health/fit";
import type { Macros } from "@/lib/health/reading";
import { useHealthDay } from "./HealthDay";
import { colorOf } from "./MacroBar";
import { MealsChips, RoomLine, macroText, useMeals } from "./Room";
import { fmt, plural } from "./fields";

type Person = Pick<DaySide, "slug" | "displayName">;

const round = (n: number) => Math.round(n * 10) / 10;
const stepButton =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[1.4rem] leading-none text-ink disabled:text-ink-faint";

/**
 * How much, and for whom (§5.6, §5.7). Counted in the food's own servings
 * where it has them ("2 packs", "3 pieces"), since that is how food is
 * eaten, and in grams when it doesn't or when you'd rather weigh it.
 *
 * Food from the fridge is shared by default: the total splits evenly, and
 * a slider moves it between you without changing the total, so 90 and 40
 * out of 130 is one drag; either number can also be typed. Anything else
 * starts as only yours. "Fit this meal" sets the amount from what each of
 * you has left of the day (§5.13). Then one of two
 * things: log it as eaten, or put it in the fridge for later (§5.10). "Add
 * another food" keeps this one waiting, so a whole meal is logged at once.
 *
 * A food with nothing to count it in, such as an egg from the food table,
 * can be given a piece right here: its name and its weight, kept on the food.
 *
 * The kcal shown is a preview; the server does the real sum.
 */
export function AmountStep({
  food,
  left,
  me,
  partner,
  waiting,
  ahead,
  last,
  onBack,
  onLog,
  onMore,
  onStock,
  onFood,
}: {
  food: FoodView;
  /** Grams of this in the fridge, or null when there is none. */
  left: number | null;
  me: Person;
  partner: Person;
  /** How many other foods are already waiting to be logged with this one. */
  waiting: number;
  /** What the foods already waiting come to for each of you, so the room shown is what's left of this meal. */
  ahead?: { mine: Macros; theirs: Macros };
  /** What each of you had the last time this was logged, in grams: where the amounts start (§5.6). */
  last?: { grams: number; partnerGrams: number };
  onBack: () => void;
  onLog: (food: FoodView, grams: number, partnerGrams?: number) => Promise<void>;
  /** Keep this one waiting and go back to choose another. */
  onMore: (food: FoodView, grams: number, partnerGrams?: number) => void;
  onStock: (food: FoodView, grams: number) => Promise<void>;
  /** The food has gained a unit to be counted in; the caller swaps in the new version. */
  onFood: (food: FoodView) => void;
}) {
  // The last unit is always plain grams.
  const GRAMS = food.servings.length;
  /** Last time's amounts in the first unit when they come to halves of it, in grams otherwise. */
  const [again] = useState(() => {
    if (!last || !(last.grams > 0)) return null;
    const each = food.servings[0]?.grams;
    const halves = (g: number) => !!each && Math.abs((g / each) * 2 - Math.round((g / each) * 2)) < 0.02;
    const counted = halves(last.grams) && halves(last.partnerGrams);
    const per = counted ? each! : 1;
    const amount = (g: number) => (counted ? Math.round((g / per) * 2) / 2 : round(g));
    return { unit: counted ? 0 : GRAMS, mine: amount(last.grams), theirs: amount(last.partnerGrams) };
  });
  const [unit, setUnit] = useState(again ? again.unit : food.servings.length ? 0 : GRAMS);
  const serving = unit === GRAMS ? null : food.servings[unit];
  /** One person's usual amount in a unit: one serving, or the food's default grams. */
  const usual = (u: number) => (u === GRAMS ? (food.defaultGrams ?? 100) : 1);
  /** Where a unit starts: the usual amount each, but never more than the fridge holds. */
  const start = (u: number, alone: boolean) => {
    const t = alone ? usual(u) : usual(u) * 2;
    const each = u === GRAMS ? 1 : food.servings[u].grams;
    return left !== null && t * each > left ? Math.max(0.5, Math.round((left / each) * 2) / 2) : t;
  };

  // Something from the fridge starts shared; something had before starts as it was had.
  const [solo, setSolo] = useState(again ? again.theirs === 0 : left === null);
  const first = again ? round(again.mine + again.theirs) : start(unit, solo);
  const [mine, setMine] = useState(again ? again.mine : solo ? first : round(first / 2));
  const [theirs, setTheirs] = useState(again ? again.theirs : solo ? 0 : round(first / 2));
  // The total as typed, so "1." or an emptied box survive a re-render.
  const [text, setText] = useState(String(first));
  /** Your share of a split total, kept so the total can change without evening the split out. */
  const [ratio, setRatio] = useState(again && first > 0 ? again.mine / first : 0.5);
  /** One side's amount while it is being typed, so "1." or an emptied box survive. */
  const [typing, setTyping] = useState<{ who: "mine" | "theirs"; text: string } | null>(null);
  const [fitNote, setFitNote] = useState<string | null>(null);
  const [busy, setBusy] = useState<"log" | "stock" | "piece" | null>(null);
  const { day } = useHealthDay();
  const [meals, setMeals] = useMeals(day.date);
  const roomMine = roomFor(day.me, meals, ahead?.mine ?? NOTHING);
  const roomTheirs = roomFor(day.partner, meals, ahead?.theirs ?? NOTHING);
  // Naming a piece ("egg", 50g), so this food can be counted rather than weighed.
  const [piece, setPiece] = useState<{ label: string; grams: string; error: string | null } | null>(null);

  const per = serving ? serving.grams : 1;
  const total = solo ? mine : mine + theirs;
  const grams = total > 0 ? round(total * per) : null;
  const step = serving ? 1 : 10;
  const shareStep = serving ? 0.5 : 5;
  const stepOf = (u: number) => (u === GRAMS ? 5 : 0.5);

  /** Sets both sides from a total: all yours when solo, otherwise in the proportion the split already has. */
  const fromTotal = (t: number, alone = solo, share = ratio, by = shareStep) => {
    setFitNote(null);
    const m = alone ? t : Math.min(t, round(Math.round((t * share) / by) * by));
    setMine(m);
    setTheirs(alone ? 0 : round(t - m));
  };
  const typeTotal = (raw: string) => {
    setText(raw);
    const t = Number(raw);
    fromTotal(raw !== "" && Number.isFinite(t) && t > 0 ? t : 0);
  };
  const setTotal = (t: number) => {
    setText(String(t));
    fromTotal(t);
  };
  const choose = (i: number) => {
    setUnit(i);
    const t = start(i, solo);
    setText(String(t));
    fromTotal(t, solo, ratio, stepOf(i));
  };
  /** The slider: moves the same total between the two of you. */
  const slide = (m: number) => {
    setFitNote(null);
    setMine(m);
    setTheirs(round(total - m));
    if (total > 0) setRatio(m / total);
  };
  /** A number typed for one of you: that side changes, the other stays, and the total follows. */
  const typeShare = (who: "mine" | "theirs", raw: string) => {
    setTyping({ who, text: raw });
    setFitNote(null);
    const n = Number(raw);
    const next = raw !== "" && Number.isFinite(n) && n > 0 ? round(n) : 0;
    const m = who === "mine" ? next : mine;
    const t = who === "mine" ? theirs : next;
    setMine(m);
    setTheirs(t);
    setText(String(round(m + t)));
    if (m + t > 0) setRatio(m / (m + t));
  };
  /** The most of this that fits what each of you has left for this meal, and never more than the fridge holds. */
  const fitNow = () => {
    if (!roomMine) return;
    const a = fit(food.per100, roomMine);
    const b = !solo && roomTheirs ? fit(food.per100, roomTheirs) : null;
    let gm = a.grams;
    let gt = b?.grams ?? 0;
    const capped = left !== null && gm + gt > left;
    if (capped) {
      const k = left / (gm + gt);
      gm *= k;
      gt *= k;
    }
    const by = serving ? 0.5 : 10;
    const down = (g: number) => round(Math.floor(g / per / by + 1e-9) * by);
    const m = down(gm);
    const t = solo ? 0 : down(gt);
    if (m + t <= 0) {
      setFitNote("There's no room left for this in this meal.");
      return;
    }
    setMine(m);
    setTheirs(t);
    setText(String(round(m + t)));
    setRatio(m / (m + t));
    setFitNote(capped ? "Fitted to what the fridge holds." : `Fitted: it stops at ${WORD[a.by]}, the first thing to run out.`);
  };
  const toggleSolo = () => {
    const alone = !solo;
    setSolo(alone);
    // Going solo keeps your amount; bringing your partner in gives them the same.
    const t = alone ? mine || usual(unit) : (mine || usual(unit)) * 2;
    setText(String(round(t)));
    setRatio(0.5);
    fromTotal(round(t), alone, 0.5);
  };

  /** Saves the piece to the food, for good, and counts in it from here on: one each. */
  async function savePiece() {
    if (!piece) return;
    const label = piece.label.trim();
    const each = Number(piece.grams);
    if (!label || !(each > 0)) {
      setPiece({ ...piece, error: "Say what one is called and how many grams it weighs." });
      return;
    }
    setBusy("piece");
    try {
      const res = await fetch(`/api/foods/${food.id}/servings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, grams: each }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Couldn't save that");
      const next = json as FoodView;
      const at = next.servings.findIndex((s) => s.label.toLowerCase() === label.toLowerCase());
      onFood(next);
      setUnit(at < 0 ? next.servings.length : at);
      setText(String(solo ? 1 : 2));
      fromTotal(solo ? 1 : 2);
      setPiece(null);
    } catch (err) {
      setPiece({ ...piece, error: err instanceof Error ? err.message : "Couldn't save that" });
    } finally {
      setBusy(null);
    }
  }

  const kcal = (amount: number) => fmt((food.per100.kcal * amount * per) / 100, 0);
  // Steps land on round numbers: 95 goes down to 90, not 85.
  const lower = Math.max(step, round(Math.ceil(total / step - 1e-9) * step - step));
  const higher = round(Math.floor(total / step + 1e-9) * step + step);
  const pct = total > 0 ? (mine / total) * 100 : 50;

  return (
    // Nothing else is touched while a piece is being saved: the amounts are reset when it lands.
    <div className="min-h-0 overflow-y-auto" style={{ pointerEvents: busy === "piece" ? "none" : undefined }}>
      <button onClick={onBack} className="h-9 text-[0.9rem] text-ink-dim">
        ← Back
      </button>
      <p className="pt-1 text-[1.15rem] leading-snug">{food.name}</p>
      <p className="text-[0.85rem] text-ink-dim">
        {food.countedOnly ? `${fmt(food.per100.kcal, 0)} kcal a ${food.servings[0]?.label ?? "pack"}` : `${fmt(food.per100.kcal, 0)} kcal per 100g`}
        {left ? (food.countedOnly ? ` · ${fmt(left / (food.servings[0]?.grams ?? 100))} in the fridge` : ` · ${fmt(left, 0)}g in the fridge`) : ""}
        {food.nameJa ? ` · ${food.nameJa}` : ""}
      </p>

      <div className="flex flex-wrap gap-1.5 pt-4">
        {/* A food counted only by the pack has no grams to offer, and no other unit to add. */}
        {food.servings.length && !food.countedOnly
          ? [...food.servings.map((s) => `${plural(s.label, 2)} · ${fmt(s.grams)}g each`), "grams"].map((name, i) => (
              <button
                key={name}
                aria-pressed={unit === i}
                onClick={() => choose(i)}
                className="h-10 rounded-full border px-3.5 text-[0.9rem]"
                style={{
                  borderColor: unit === i ? "var(--ink-dim)" : "var(--hairline)",
                  color: unit === i ? "var(--ink)" : "var(--ink-dim)",
                  background: unit === i ? "var(--ground-raised)" : "transparent",
                }}
              >
                {name}
              </button>
            ))
          : null}
        {piece || food.countedOnly ? null : (
          <button
            onClick={() => setPiece({ label: "", grams: "", error: null })}
            className="h-10 rounded-full border border-dashed border-hairline-strong px-3.5 text-[0.9rem] text-ink-dim"
          >
            {food.servings.length ? "+ Another unit" : "+ Count by the piece"}
          </button>
        )}
      </div>
      {piece ? (
        <div className="mt-3 rounded-xl border border-hairline bg-ground-raised p-3">
          <div className="flex gap-2">
            <label className="flex min-w-0 flex-1 flex-col">
              <span className="pb-1 text-[0.8rem] text-ink-faint">One is called</span>
              <input
                aria-label="What one is called"
                value={piece.label}
                onChange={(e) => setPiece({ ...piece, label: e.target.value, error: null })}
                placeholder="egg, banana, slice"
                autoCapitalize="none"
                className="h-11 w-full min-w-0 rounded-[10px] border border-hairline bg-ground-sunk px-3 text-[1rem] text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
              />
            </label>
            <label className="flex w-28 shrink-0 flex-col">
              <span className="pb-1 text-[0.8rem] text-ink-faint">Grams in one</span>
              <input
                aria-label="Grams in one"
                inputMode="decimal"
                value={piece.grams}
                onChange={(e) => setPiece({ ...piece, grams: e.target.value.replace(/[^\d.,]/g, "").replace(",", "."), error: null })}
                className="h-11 w-full min-w-0 rounded-[10px] border border-hairline bg-ground-sunk px-3 text-[1rem] tabular-nums text-ink focus:border-hairline-strong focus:outline-none"
              />
            </label>
          </div>
          <p className="pt-2 text-[0.8rem] leading-relaxed text-ink-dim">
            {piece.error ?? "Weigh the part you eat: an egg without its shell, a banana without its peel. It's kept for next time."}
          </p>
          <div className="flex gap-2 pt-2">
            <button
              onClick={savePiece}
              disabled={busy !== null}
              className="h-11 flex-1 rounded-xl border border-hairline-strong bg-ground text-[0.95rem] text-ink disabled:text-ink-faint"
            >
              {busy === "piece" ? "…" : "Count in these"}
            </button>
            <button onClick={() => setPiece(null)} className="h-11 rounded-xl border border-hairline px-4 text-[0.95rem] text-ink-dim">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {roomMine ? (
        <div className="mt-4 flex flex-col gap-2 rounded-xl border border-hairline bg-ground-raised px-3.5 py-3">
          <MealsChips meals={meals} onMeals={setMeals} />
          <RoomLine name={me.displayName} color={colorOf(me.slug)} room={roomMine} />
          {!solo && roomTheirs ? <RoomLine name={partner.displayName} color={colorOf(partner.slug)} room={roomTheirs} /> : null}
          <button onClick={fitNow} className="mt-1 h-11 rounded-full border border-hairline-strong text-[0.95rem] font-semibold text-ink">
            Fit this meal
          </button>
          {fitNote ? <p className="text-[0.8rem] leading-relaxed text-ink-dim">{fitNote}</p> : null}
        </div>
      ) : null}

      <div className="flex items-center gap-3 pt-4">
        <button aria-label="Less" onClick={() => setTotal(lower)} disabled={total <= step} className={stepButton}>
          −
        </button>
        <label className="flex min-w-0 flex-1 items-baseline justify-center gap-2 rounded-[10px] border border-hairline bg-ground-sunk px-3 py-2">
          <input
            aria-label={serving ? `How many ${plural(serving.label, 2)}` : "Grams"}
            inputMode="decimal"
            value={text}
            onChange={(e) => typeTotal(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
            className="w-20 min-w-0 bg-transparent text-right text-[1.75rem] font-bold tabular-nums text-ink focus:outline-none"
          />
          <span className="text-[1rem] text-ink-dim">
            {serving ? plural(serving.label, total) : "g"}
            {solo ? "" : " in all"}
          </span>
        </label>
        <button aria-label="More" onClick={() => setTotal(higher)} className={stepButton}>
          +
        </button>
      </div>
      <p className="h-6 pt-2 text-center text-[0.9rem] tabular-nums text-ink-dim">
        {grams
          ? food.countedOnly
            ? `${kcal(total)} kcal`
            : `${serving ? `${fmt(grams)}g · ` : ""}${kcal(total)} kcal${left ? ` · leaves ${fmt(Math.max(0, left - grams), 0)}g in the fridge` : ""}`
          : ""}
      </p>

      <div className="flex items-center justify-between pt-3">
        <span className="text-[0.85rem] text-ink-dim">{solo ? "Only you" : "Split between you"}</span>
        <button onClick={toggleSolo} className="h-10 rounded-full border border-hairline px-3.5 text-[0.9rem] text-ink">
          {solo ? `With ${partner.displayName}` : "Only me"}
        </button>
      </div>
      {solo ? null : (
        <div className="mt-2 rounded-xl border border-hairline bg-ground-raised px-3.5 pt-3 pb-3">
          <div className="flex items-end justify-between gap-3">
            {(
              [
                [me, mine, "mine", " · you", "items-start"],
                [partner, theirs, "theirs", "", "items-end"],
              ] as const
            ).map(([person, amount, who, note, side]) => (
              <label key={who} className={`flex min-w-0 flex-col ${side}`}>
                <span className="text-[0.85rem] text-ink-dim">
                  {person.displayName}
                  {note}
                </span>
                <span className="flex items-baseline gap-1 border-b border-dashed border-hairline-strong">
                  <input
                    aria-label={`Amount for ${person.displayName}`}
                    inputMode="decimal"
                    value={typing?.who === who ? typing.text : fmt(amount)}
                    onFocus={(e) => {
                      setTyping({ who, text: fmt(amount) });
                      e.target.select();
                    }}
                    onChange={(e) => typeShare(who, e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))}
                    onBlur={() => setTyping(null)}
                    className="min-w-0 bg-transparent text-[1.6rem] leading-tight font-bold tabular-nums text-ink focus:outline-none"
                    // As wide as what it holds, so the unit sits beside the number on both sides.
                    style={{ width: `${Math.max(2, (typing?.who === who ? typing.text : fmt(amount)).length) + 0.3}ch` }}
                  />
                  <span className="text-[0.9rem] text-ink-dim">{serving ? plural(serving.label, amount) : "g"}</span>
                </span>
              </label>
            ))}
          </div>
          <div className="relative mx-4 mt-2 flex h-11 items-center">
            <div aria-hidden className="flex h-2 w-full gap-0.5">
              <span className="rounded-l-full" style={{ width: `${pct}%`, background: colorOf(me.slug) }} />
              <span className="flex-1 rounded-r-full" style={{ background: colorOf(partner.slug) }} />
            </div>
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ground-raised bg-ink"
              style={{ left: `${pct}%` }}
            />
            <input
              type="range"
              aria-label={`How much of it is for ${me.displayName}`}
              min={0}
              max={total}
              step={shareStep}
              value={mine}
              disabled={total <= 0}
              onChange={(e) => slide(Number(e.target.value))}
              className="absolute -inset-x-4 inset-y-0 h-full opacity-0"
              style={{ width: "calc(100% + 2rem)" }}
            />
          </div>
          <div className="flex justify-between text-[0.8rem] tabular-nums text-ink-dim">
            <span>{macroText(of(food.per100, mine * per))}</span>
            <span>{macroText(of(food.per100, theirs * per))}</span>
          </div>
          <p className="pt-2 text-[0.8rem] leading-relaxed text-ink-faint">Drag to move it between you; the total stays. Tap a number to type it.</p>
        </div>
      )}

      <button
        onClick={async () => {
          if (!grams) return;
          setBusy("log");
          await onLog(food, round(mine * per), solo ? undefined : round(theirs * per));
          setBusy(null);
        }}
        disabled={busy !== null || !grams}
        className="mt-5 h-14 w-full rounded-xl bg-ink text-[1.1rem] font-bold text-ground disabled:opacity-50"
      >
        {busy === "log" ? "…" : waiting ? `Log all ${waiting + 1}` : solo ? "Log it" : "Log for both of you"}
      </button>
      <div className="mt-2 flex gap-2">
        <button
          onClick={() => grams && onMore(food, round(mine * per), solo ? undefined : round(theirs * per))}
          disabled={busy !== null || !grams}
          className="h-12 flex-1 rounded-xl border border-hairline-strong text-[1rem] text-ink disabled:text-ink-faint"
        >
          Add another food
        </button>
        {/* With others waiting this is a meal being logged, not shopping being put away. */}
        {waiting ? null : (
          <button
            onClick={async () => {
              if (!grams) return;
              setBusy("stock");
              await onStock(food, grams);
              setBusy(null);
            }}
            disabled={busy !== null || !grams}
            className="h-12 flex-1 rounded-xl border border-hairline-strong text-[1rem] text-ink disabled:text-ink-faint"
          >
            {busy === "stock" ? "…" : "Add to fridge"}
          </button>
        )}
      </div>
    </div>
  );
}
