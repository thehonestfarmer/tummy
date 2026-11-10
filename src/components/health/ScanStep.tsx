"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { DraftView, FoodView, ReviewView } from "@/lib/health/foods";
import {
  CROSS_CHECK_TOLERANCE,
  crossCheckGap,
  implausibility,
  normalize,
  PLAUSIBILITY_TOLERANCE,
} from "@/lib/health/reading";
import { fmt } from "./fields";

const primary =
  "w-full rounded-[10px] border border-hairline-strong bg-ground-raised py-3 text-[1rem] text-ink disabled:text-ink-faint";
const quiet = "flex-1 rounded-[10px] border border-hairline py-2.5 text-center text-[0.9rem] text-ink-dim";

/** How often to ask whether the label has been read yet. A read takes a few seconds. */
const POLL_MS = 1500;

/**
 * Scan and eat in one flow (healthspec.md §5.6): the photo has been taken,
 * and this waits for it to be read, shows what was read, and takes a yes.
 * The rule is the same as everywhere (§5.9): a person sees the values before
 * the food counts. Anything that needs more than a yes goes to the full
 * review form, where every field can be changed.
 *
 * `draftId` is null while the photo is still on its way up.
 */
export function ScanStep({
  draftId,
  onFood,
  onRetake,
  onClose,
}: {
  draftId: number | null;
  onFood: (food: FoodView) => void;
  onRetake: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<DraftView | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const settled = draft !== null && draft.state !== "reading";

  useEffect(() => {
    if (draftId === null || settled) return;
    let live = true;
    const look = async () => {
      try {
        const res = await fetch("/api/review", { cache: "no-store" });
        if (!res.ok || !live) return;
        const found = ((await res.json()) as ReviewView).drafts.find((d) => d.id === draftId);
        if (found) setDraft(found);
      } catch {
        // Offline for a moment; the next look will catch up.
      }
    };
    void look();
    const timer = setInterval(look, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [draftId, settled]);

  /** Once the draft is a food, by confirming it or by saying it is one we already have, go on to how much. */
  async function finish(body: Record<string, unknown>, foodId: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "That didn't work");
      const food = await fetch(`/api/foods/${foodId}`);
      if (!food.ok) throw new Error("Saved, but couldn't load it. Find it in the list.");
      onFood((await food.json()) as FoodView);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  if (draftId === null || !draft || draft.state === "reading") {
    return (
      <div className="py-2">
        <p className="text-[1.05rem]">{draftId === null ? "Sending the photo…" : "Reading the label…"}</p>
        <p className="pt-1 text-[0.9rem] text-ink-dim">A few seconds. You&rsquo;ll see what was read before it counts.</p>
      </div>
    );
  }

  const reading = draft.reading;
  if (draft.state === "failed" || !reading) {
    return (
      <div className="py-2">
        <p className="text-[1.05rem]">Couldn&rsquo;t read that one.</p>
        <p className="pt-1 text-[0.9rem] text-ink-dim">{draft.error ?? "Try a closer photo of the nutrition table."}</p>
        <div className="flex gap-2 pt-4">
          <button onClick={onRetake} className={quiet}>
            Take it again
          </button>
          <Link href="/review" onClick={onClose} className={quiet}>
            Type it in
          </Link>
        </div>
      </div>
    );
  }

  const n = normalize(reading);
  const label = reading.kind === "nutrition_label";
  const off = n.per100 ? implausibility(n.per100) : null;
  const gap = label && draft.reference && n.per100 ? crossCheckGap(n.per100, draft.reference) : null;

  return (
    <div>
      <p className="text-[1.15rem] leading-snug">{reading.name || "No name read"}</p>
      {reading.name_ja || reading.brand ? (
        <p className="text-[0.85rem] text-ink-dim">{[reading.brand, reading.name_ja].filter(Boolean).join(" · ")}</p>
      ) : null}

      {n.per100 ? (
        <div className="mt-4 grid grid-cols-4 gap-2 rounded-[10px] border border-hairline bg-ground-raised px-3 py-3 text-center">
          {(
            [
              ["kcal", fmt(n.per100.kcal, 0)],
              ["Protein", `${fmt(n.per100.protein_g)}g`],
              ["Fat", `${fmt(n.per100.fat_g)}g`],
              ["Carbs", `${fmt(n.per100.carbs_g)}g`],
            ] as const
          ).map(([name, value]) => (
            <div key={name}>
              <div className="text-[1.15rem] font-semibold tabular-nums">{value}</div>
              <div className="text-[0.75rem] text-ink-dim">{name}</div>
            </div>
          ))}
        </div>
      ) : null}
      <p className="pt-2 text-[0.85rem] leading-relaxed text-ink-dim">
        Per 100g
        {label
          ? ", from the label"
          : draft.reference
            ? `, from the food table: ${draft.reference.name}`
            : ". No table row matched, so this is an estimate. Check it harder"}
        {n.servings.length ? ` · ${n.servings.map((s) => `1 ${s.label} = ${fmt(s.grams)}g`).join(" · ")}` : ""}
      </p>

      {gap !== null && gap > CROSS_CHECK_TOLERANCE ? (
        <p className="pt-2 text-[0.9rem] leading-relaxed">
          This reads very differently from typical {draft.reference!.name} ({draft.reference!.per100.kcal} kcal per 100g).
          Check the numbers against the packet.
        </p>
      ) : null}
      {off !== null && off > PLAUSIBILITY_TOLERANCE ? (
        <p className="pt-2 text-[0.9rem] leading-relaxed">
          The calories are {Math.round(off * 100)}% off what the macros add up to. Worth a second look at the label.
        </p>
      ) : null}
      {n.problems.map((p) => (
        <p key={p} className="pt-2 text-[0.9rem] leading-relaxed">
          {p}
        </p>
      ))}

      <button
        disabled={busy || n.problems.length > 0}
        onClick={() => finish({ action: "confirm", id: draft.id, reading, reference: draft.reference?.id ?? null }, draft.id)}
        className={`${primary} mt-4`}
      >
        {busy ? "…" : "Looks right"}
      </button>
      {draft.matches.map((m) => (
        <button
          key={m.id}
          disabled={busy}
          onClick={() => finish({ action: "merge", id: draft.id, into: m.id }, m.id)}
          className="mt-2 w-full rounded-[10px] border border-hairline py-2.5 text-[0.9rem] text-ink-dim"
        >
          It&rsquo;s the {m.name} we already have
        </button>
      ))}
      <div className="flex gap-2 pt-2">
        <Link href="/review" onClick={onClose} className={quiet}>
          Fix the numbers
        </Link>
        <button onClick={onRetake} disabled={busy} className={quiet}>
          Take it again
        </button>
      </div>
      {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </div>
  );
}
