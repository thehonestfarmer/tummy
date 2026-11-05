"use client";

import Link from "next/link";
import { useState } from "react";
import type { EntryView } from "@/lib/health/entries";
import { useHealthDay } from "./HealthDay";
import { PartnerBar } from "./MacroBar";
import { FoodSheet } from "./FoodSheet";
import { EntrySheet } from "./EntrySheet";
import { SaveMealSheet } from "./SaveMealSheet";
import { fmt } from "./fields";

type Group = { key: string; hour: number; entries: EntryView[] };

/** A run this long in one hour folds into a single row (§8): ten senbei are one thought, not ten. */
const COLLAPSE_AT = 3;

function groupByHour(entries: EntryView[]): Group[] {
  const groups: Group[] = [];
  for (const e of entries) {
    const last = groups[groups.length - 1];
    if (last && last.hour === e.hour) last.entries.push(e);
    else groups.push({ key: `${e.hour}-${e.id}`, hour: e.hour, entries: [e] });
  }
  return groups;
}

function formatDate(date: string): string {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(
    new Date(`${date}T00:00:00Z`),
  );
}

function EntryRow({ entry, onOpen, picked }: { entry: EntryView; onOpen: () => void; picked?: boolean }) {
  return (
    <button onClick={onOpen} className="flex w-full items-baseline gap-3 py-2.5 text-left">
      {picked !== undefined ? (
        <span
          aria-hidden
          className="h-3.5 w-3.5 shrink-0 self-center rounded-[2px] border"
          style={{ borderColor: "var(--ink-dim)", background: picked ? "var(--ink-dim)" : "transparent" }}
        />
      ) : null}
      <span className="w-11 shrink-0 text-[0.85rem] tabular-nums text-ink-faint">{entry.clock}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1rem]">{entry.name}</span>
        <span className="block text-[0.8rem] text-ink-faint">
          {fmt(entry.grams, 0)}g{entry.addedBy ? ` · added by ${entry.addedBy}` : ""}
        </span>
      </span>
      <span className="shrink-0 text-[0.9rem] tabular-nums text-ink-dim">{entry.macros.kcal} kcal</span>
    </button>
  );
}

/**
 * Health's Today (§8): what you've eaten, newest first, a way to add more,
 * and your partner's day in one line. With 10–20 small logs a day, a busy
 * hour folds into one row that opens on a tap.
 */
export function HealthToday() {
  const { day } = useHealthDay();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<EntryView | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Picking entries to save as a meal: "what I just had is my usual lunch" (§5.6).
  const [picking, setPicking] = useState<Set<number> | null>(null);
  const [saving, setSaving] = useState(false);
  const groups = groupByHour(day.me.entries);
  const toggle = (id: number) => {
    if (!picking) return;
    const next = new Set(picking);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicking(next);
  };

  return (
    <div className="px-3 pt-3 pb-6">
      <header className="flex items-baseline gap-2">
        <h1 className="text-[1.15rem] leading-none">{formatDate(day.date)}</h1>
        {day.me.entries.length ? (
          <button
            onClick={() => setPicking(picking ? null : new Set())}
            className="ml-auto text-[0.9rem] text-ink-dim"
          >
            {picking ? "Cancel" : "Save as meal"}
          </button>
        ) : null}
      </header>
      {picking ? (
        <div className="flex items-center gap-3 pt-3">
          <p className="flex-1 text-[0.9rem] text-ink-dim">Pick what goes in the meal.</p>
          <button
            disabled={!picking.size}
            onClick={() => setSaving(true)}
            className="rounded-[3px] border border-hairline-strong bg-ground-raised px-4 py-2 text-[0.95rem] text-ink disabled:text-ink-faint"
          >
            Save {picking.size || ""}
          </button>
        </div>
      ) : null}

      <button
        onClick={() => setAdding(true)}
        className="mt-4 w-full rounded-[3px] border border-hairline-strong bg-ground-raised py-3.5 text-[1rem] text-ink"
      >
        + Food
      </button>

      {day.me.entries.length ? (
        <ul className="pt-3">
          {groups.map((g) => {
            const collapsed = g.entries.length >= COLLAPSE_AT && !open.has(g.key) && !picking;
            if (collapsed) {
              const kcal = g.entries.reduce((n, e) => n + e.macros.kcal, 0);
              return (
                <li key={g.key} className="border-b border-hairline">
                  <button
                    onClick={() => setOpen(new Set(open).add(g.key))}
                    className="flex w-full items-baseline gap-3 py-2.5 text-left"
                  >
                    <span className="w-11 shrink-0 text-[0.85rem] tabular-nums text-ink-faint">
                      {String(g.hour).padStart(2, "0")}:00
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[1rem]">
                      {g.entries.length} snacks
                      <span className="text-[0.85rem] text-ink-faint">
                        {" "}
                        · {[...new Set(g.entries.map((e) => e.name))].slice(0, 3).join(", ")}
                      </span>
                    </span>
                    <span className="shrink-0 text-[0.9rem] tabular-nums text-ink-dim">{kcal} kcal</span>
                  </button>
                </li>
              );
            }
            return g.entries.map((e) => (
              <li key={e.id} className="border-b border-hairline">
                <EntryRow
                  entry={e}
                  picked={picking ? picking.has(e.id) : undefined}
                  onOpen={() => (picking ? toggle(e.id) : setEditing(e))}
                />
              </li>
            ));
          })}
        </ul>
      ) : (
        <p className="pt-4 text-[1rem] leading-relaxed text-ink-dim">Nothing logged yet today.</p>
      )}

      <div className="mt-6 border-t border-hairline pt-3">
        <PartnerBar />
      </div>

      <p className="pt-8 text-center text-[0.85rem]">
        <Link href="/connect" className="text-ink-faint">
          Claude and ChatGPT
        </Link>
      </p>

      {adding ? <FoodSheet onClose={() => setAdding(false)} /> : null}
      {editing ? <EntrySheet entry={editing} onClose={() => setEditing(null)} /> : null}
      {saving && picking ? (
        <SaveMealSheet
          entries={day.me.entries.filter((e) => picking.has(e.id))}
          onClose={() => setSaving(false)}
          onSaved={() => {
            setSaving(false);
            setPicking(null);
          }}
        />
      ) : null}
    </div>
  );
}
