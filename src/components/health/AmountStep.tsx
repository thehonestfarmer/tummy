"use client";

import { useState } from "react";
import type { DaySide } from "@/lib/health/entries";
import type { FoodView } from "@/lib/health/foods";
import { colorOf } from "./MacroBar";
import { fmt } from "./fields";

type Person = Pick<DaySide, "slug" | "displayName">;

const round = (n: number) => Math.round(n * 10) / 10;
const plural = (label: string, n: number) => (n === 1 || label.endsWith("s") ? label : `${label}s`);
const stepButton =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[1.4rem] leading-none text-ink disabled:text-ink-faint";

/**
 * How much, and for whom (§5.6, §5.7). Counted in the food's own servings
 * where it has them ("2 packs", "3 pieces"), since that is how food is
 * eaten, and in grams when it doesn't or when you'd rather weigh it.
 *
 * Food from the fridge is shared by default: the total splits evenly, and
 * either side can be moved on its own, so "two yogurts for me, one for
 * Bunny" is one tap. Anything else starts as only yours. Then one of two
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
  const [unit, setUnit] = useState(food.servings.length ? 0 : GRAMS);
  const serving = unit === GRAMS ? null : food.servings[unit];
  /** One person's usual amount in a unit: one serving, or the food's default grams. */
  const usual = (u: number) => (u === GRAMS ? (food.defaultGrams ?? 100) : 1);
  /** Where a unit starts: the usual amount each, but never more than the fridge holds. */
  const start = (u: number, alone: boolean) => {
    const t = alone ? usual(u) : usual(u) * 2;
    const each = u === GRAMS ? 1 : food.servings[u].grams;
    return left !== null && t * each > left ? Math.max(0.5, Math.round((left / each) * 2) / 2) : t;
  };

  const [solo, setSolo] = useState(left === null);
  const first = start(unit, solo);
  const [mine, setMine] = useState(solo ? first : round(first / 2));
  const [theirs, setTheirs] = useState(solo ? 0 : round(first / 2));
  // The total as typed, so "1." or an emptied box survive a re-render.
  const [text, setText] = useState(String(first));
  const [busy, setBusy] = useState<"log" | "stock" | "piece" | null>(null);
  // Naming a piece ("egg", 50g), so this food can be counted rather than weighed.
  const [piece, setPiece] = useState<{ label: string; grams: string; error: string | null } | null>(null);

  const per = serving ? serving.grams : 1;
  const total = solo ? mine : mine + theirs;
  const grams = total > 0 ? round(total * per) : null;
  const step = serving ? 1 : 10;
  const shareStep = serving ? 0.5 : 10;

  /** Sets both sides from a total: all yours when solo, split evenly otherwise. */
  const fromTotal = (t: number, alone = solo) => {
    setMine(alone ? t : round(t / 2));
    setTheirs(alone ? 0 : round(t / 2));
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
    fromTotal(t);
  };
  const share = (who: "mine" | "theirs", by: number) => {
    const next = Math.max(0, round((who === "mine" ? mine : theirs) + by));
    if (who === "mine") setMine(next);
    else setTheirs(next);
    setText(String(round(next + (who === "mine" ? theirs : mine))));
  };
  const toggleSolo = () => {
    const alone = !solo;
    setSolo(alone);
    // Going solo keeps your amount; bringing your partner in gives them the same.
    const t = alone ? mine || usual(unit) : (mine || usual(unit)) * 2;
    setText(String(round(t)));
    fromTotal(round(t), alone);
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
  const said = (amount: number) => (serving ? `${fmt(amount)} ${plural(serving.label, amount)}` : `${fmt(amount)}g`);

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

      <div className="flex items-center gap-3 pt-4">
        <button aria-label="Less" onClick={() => setTotal(Math.max(step, round(total - step)))} disabled={total <= step} className={stepButton}>
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
        <button aria-label="More" onClick={() => setTotal(round(total + step))} className={stepButton}>
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
        <div className="flex flex-col gap-2 pt-2">
          {(
            [
              [me, mine, "mine", " · you"],
              [partner, theirs, "theirs", ""],
            ] as const
          ).map(([person, amount, who, note]) => (
            <div key={who} className="flex items-center gap-3 rounded-[10px] border border-hairline bg-ground-raised py-2 pr-2 pl-3">
              <span aria-hidden className="h-9 w-1 rounded-full" style={{ background: colorOf(person.slug) }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.95rem]">
                  {person.displayName}
                  <span className="text-ink-dim">{note}</span>
                </span>
                <span className="block text-[0.8rem] tabular-nums text-ink-dim">{kcal(amount)} kcal</span>
              </span>
              <button aria-label={`Less for ${person.displayName}`} onClick={() => share(who, -shareStep)} disabled={amount <= 0} className={stepButton}>
                −
              </button>
              <span className="w-20 text-center text-[1rem] font-semibold tabular-nums">{said(amount)}</span>
              <button aria-label={`More for ${person.displayName}`} onClick={() => share(who, shareStep)} className={stepButton}>
                +
              </button>
            </div>
          ))}
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
