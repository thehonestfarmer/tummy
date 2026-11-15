"use client";

import { useEffect, useState } from "react";
import type { FoodView } from "@/lib/health/foods";
import type { ReferenceHit } from "@/lib/health/reference";

/**
 * Rows of the food table that match what is being typed (§5.8), fetched a
 * moment after the typing stops. Rows already showing as one of our own
 * foods are left out.
 */
export function useTableRows(query: string, showing: { id: number }[]): ReferenceHit[] {
  const q = query.trim();
  const [found, setFound] = useState<{ q: string; rows: ReferenceHit[] }>({ q: "", rows: [] });
  useEffect(() => {
    if (!q) return;
    const stop = new AbortController();
    const timer = setTimeout(() => {
      fetch(`/api/reference?q=${encodeURIComponent(q)}`, { cache: "no-store", signal: stop.signal })
        .then((r) => (r.ok ? r.json() : { rows: [] }))
        .then((json: { rows: ReferenceHit[] }) => setFound({ q, rows: json.rows ?? [] }))
        .catch(() => {});
    }, 180);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
  }, [q]);
  // Rows from an earlier query stay up while the next one loads, unless the box was cleared.
  if (!q) return [];
  const seen = new Set(showing.map((f) => f.id));
  return found.rows.filter((r) => r.foodId === null || !seen.has(r.foodId));
}

/** The matching rows, as list items for the search list they sit in. Picking one makes it a food. */
export function TableRows({
  rows,
  onFood,
  onError,
}: {
  rows: ReferenceHit[];
  onFood: (food: FoodView) => void;
  onError: (message: string) => void;
}) {
  const [busy, setBusy] = useState<number | null>(null);
  if (!rows.length) return null;

  async function pick(row: ReferenceHit) {
    if (busy !== null) return;
    setBusy(row.id);
    try {
      const res = await fetch("/api/reference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Couldn't add that");
      onFood((json as { food: FoodView }).food);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Couldn't add that");
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <li className="pt-3 pb-1 text-[0.8rem] text-ink-faint">Food table · per 100g</li>
      {rows.map((r) => (
        <li key={`t${r.id}`} className="border-b border-hairline">
          <button onClick={() => pick(r)} disabled={busy !== null} className="flex w-full items-baseline gap-2 py-2.5 text-left disabled:opacity-60">
            <span className="min-w-0 flex-1">
              {/* Not cut short: how it was prepared comes last in the name, and that is what tells the rows apart. */}
              <span className="block text-[1rem] leading-snug">{r.name}</span>
              {r.nameJa !== r.name ? <span className="block truncate text-[0.8rem] text-ink-faint">{r.nameJa}</span> : null}
            </span>
            <span className="shrink-0 text-[0.85rem] tabular-nums text-ink-faint">{busy === r.id ? "…" : `${Math.round(r.kcal)} kcal`}</span>
          </button>
        </li>
      ))}
    </>
  );
}
