"use client";

import { useState } from "react";
import type { EntryView, HealthDayView } from "@/lib/health/entries";
import { useHealthDay } from "./HealthDay";
import { Sheet } from "./Sheet";
import { NumberField, fmt } from "./fields";

function shift(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Correcting one entry (§5.4): the amount, the day it belongs to, or removing it. */
export function EntrySheet({ entry, onClose }: { entry: EntryView; onClose: () => void }) {
  const { setDay } = useHealthDay();
  const [grams, setGrams] = useState<number | null>(entry.grams);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const per100 = entry.grams > 0 ? entry.macros.kcal / entry.grams : 0;

  async function send(method: "PATCH" | "DELETE", body?: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/entries/${entry.id}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "That didn't work");
      setDay(json as HealthDayView);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <p className="text-[1.05rem]">{entry.name}</p>
      <p className="pt-0.5 text-[0.85rem] text-ink-faint">
        {entry.clock}
        {entry.addedBy ? ` · added by ${entry.addedBy}` : ""}
      </p>
      <div className="flex items-end gap-3 pt-4">
        <div className="w-32">
          <NumberField label="Grams" value={grams} onChange={setGrams} />
        </div>
        <p className="pb-2 text-[0.95rem] tabular-nums text-ink-dim">
          {grams ? `${fmt(per100 * grams, 0)} kcal` : ""}
        </p>
      </div>
      <button
        onClick={() => send("PATCH", { grams })}
        disabled={busy || !grams || grams === entry.grams}
        className="mt-4 w-full rounded-[10px] border border-hairline-strong bg-ground-raised py-3 text-[1rem] text-ink disabled:text-ink-faint"
      >
        Save
      </button>
      <div className="flex gap-2 pt-2">
        <button
          onClick={() => send("PATCH", { localDate: shift(entry.localDate, -1) })}
          disabled={busy}
          className="flex-1 rounded-[10px] border border-hairline py-2.5 text-[0.9rem] text-ink-dim"
        >
          Move to the day before
        </button>
        <button
          onClick={() => send("DELETE")}
          disabled={busy}
          className="flex-1 rounded-[10px] border border-hairline py-2.5 text-[0.9rem] text-ink-dim"
        >
          Remove
        </button>
      </div>
      {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </Sheet>
  );
}
