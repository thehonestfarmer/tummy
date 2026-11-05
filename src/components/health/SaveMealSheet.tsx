"use client";

import { useState } from "react";
import type { EntryView } from "@/lib/health/entries";
import { useHealthDay } from "./HealthDay";
import { Sheet } from "./Sheet";
import { TextField, fmt } from "./fields";

/**
 * Names a set of entries as a saved meal (§5.6). The grams saved are the
 * ones you had, per person. Marked "both of us", one tap later logs the same
 * list into both of your days.
 */
export function SaveMealSheet({
  entries,
  onClose,
  onSaved,
}: {
  entries: EntryView[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { toast } = useHealthDay();
  const [name, setName] = useState("");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const items = entries.filter((e) => e.foodId !== null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/meals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, shared, items: items.map((e) => ({ foodId: e.foodId, grams: e.grams })) }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save");
      toast({ text: `Saved ${name.trim()}. Say “${name.trim()}” or find it under + Food.` });
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <TextField label="Call it" value={name} onChange={setName} placeholder="usual lunch" />
      <ul className="pt-3 text-[0.9rem] text-ink-dim">
        {items.map((e) => (
          <li key={e.id} className="flex gap-2 py-0.5">
            <span className="min-w-0 flex-1 truncate">{e.name}</span>
            <span className="tabular-nums">{fmt(e.grams, 0)}g</span>
          </li>
        ))}
      </ul>
      <label className="flex items-center gap-2.5 pt-4 text-[0.95rem]">
        <input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} className="h-4 w-4" />
        Both of us eat this
      </label>
      <button
        onClick={save}
        disabled={busy || !name.trim() || !items.length}
        className="mt-4 w-full rounded-[3px] border border-hairline-strong bg-ground-raised py-3 text-[1rem] text-ink disabled:text-ink-faint"
      >
        {busy ? "…" : "Save meal"}
      </button>
      {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </Sheet>
  );
}
