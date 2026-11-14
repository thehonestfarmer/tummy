"use client";

import { useEffect, useState } from "react";
import type { EntryView, HealthDayView } from "@/lib/health/entries";
import { formatDay } from "@/lib/health/zone";
import { useHealthDay } from "./HealthDay";
import { SideLine } from "./MacroBar";
import { EntrySheet } from "./EntrySheet";
import { SaveMealSheet } from "./SaveMealSheet";
import { Sheet } from "./Sheet";
import { SwipeRow } from "./SwipeRow";
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

function EntryLine({ entry, picked }: { entry: EntryView; picked?: boolean }) {
  return (
    <>
      {picked !== undefined ? (
        <span
          aria-hidden
          className="h-4 w-4 shrink-0 rounded-[4px] border"
          style={{ borderColor: "var(--ink-dim)", background: picked ? "var(--ink-dim)" : "transparent" }}
        />
      ) : null}
      <span className="w-11 shrink-0 text-[0.8rem] tabular-nums text-ink-dim">{entry.clock}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[1rem]">{entry.name}</span>
        <span className="block truncate text-[0.8rem] text-ink-dim">
          {fmt(entry.grams, 0)}g
          {entry.addedBy ? ` · added by ${entry.addedBy}` : entry.sharedMealId !== null ? " · shared" : ""}
        </span>
      </span>
      <span className="shrink-0 text-[0.9rem] tabular-nums text-ink-dim">{entry.macros.kcal} kcal</span>
    </>
  );
}

const rowClass = "flex w-full items-center gap-3 py-3 text-left";

/**
 * Home (§8): what you've eaten on the day on show, newest first, and your
 * partner's day in one line. The numbers sit above it and the actions are
 * docked below, so this is only the list. With 10–20 small logs a day, a
 * busy hour folds into one row that opens on a tap.
 */
export function HealthToday() {
  const { day, date, setDay, toast } = useHealthDay();
  // The one row slid open to show Remove, if any.
  const [swiped, setSwiped] = useState<number | null>(null);
  const [editing, setEditing] = useState<EntryView | null>(null);
  const [open, setOpen] = useState<Set<string>>(new Set());
  // Picking entries to save as a meal: "what I just had is my usual lunch" (§5.6).
  const [picking, setPicking] = useState<Set<number> | null>(null);
  const [saving, setSaving] = useState(false);
  const [partner, setPartner] = useState(false);
  const groups = groupByHour(day.me.entries);

  /** Swiped away (§5.4). The swipe and the tap on the bin are the two steps; there is no third. */
  async function remove(entry: EntryView) {
    setSwiped(null);
    try {
      const res = await fetch(`/api/entries/${entry.id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't remove that");
      setDay(json as HealthDayView);
      toast({ text: `Removed ${entry.name}` });
      return true;
    } catch (err) {
      toast({ text: err instanceof Error ? err.message : "Couldn't remove that" });
      return false;
    }
  }
  const toggle = (id: number) => {
    if (!picking) return;
    const next = new Set(picking);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setPicking(next);
  };

  return (
    <div className="px-5 pt-1 pb-6">
      {picking ? (
        <div className="flex items-center gap-3 pt-3">
          <p className="flex-1 text-[0.9rem] text-ink-dim">Pick what goes in the meal.</p>
          <button onClick={() => setPicking(null)} className="h-11 px-2 text-[0.9rem] text-ink-dim">
            Cancel
          </button>
          <button
            disabled={!picking.size}
            onClick={() => setSaving(true)}
            className="h-11 rounded-[10px] border border-hairline-strong bg-ground-raised px-4 text-[0.95rem] text-ink disabled:text-ink-faint"
          >
            Save {picking.size || ""}
          </button>
        </div>
      ) : null}

      {day.me.entries.length ? (
        <ul>
          {groups.map((g) => {
            const collapsed = g.entries.length >= COLLAPSE_AT && !open.has(g.key) && !picking;
            if (collapsed) {
              const kcal = g.entries.reduce((n, e) => n + e.macros.kcal, 0);
              return (
                <li key={g.key} className="border-b border-hairline">
                  <button onClick={() => setOpen(new Set(open).add(g.key))} className={rowClass}>
                    <span className="w-11 shrink-0 text-[0.8rem] tabular-nums text-ink-dim">
                      {String(g.hour).padStart(2, "0")}:00
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[1rem]">
                      {g.entries.length} snacks
                      <span className="text-[0.8rem] text-ink-dim">
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
                <SwipeRow
                  open={swiped === e.id}
                  onOpenChange={(open) => setSwiped(open ? e.id : null)}
                  onTap={() => (picking ? toggle(e.id) : setEditing(e))}
                  onRemove={() => remove(e)}
                  label={`Remove ${e.name}`}
                  disabled={picking !== null}
                >
                  <button className={rowClass}>
                    <EntryLine entry={e} picked={picking ? picking.has(e.id) : undefined} />
                  </button>
                </SwipeRow>
              </li>
            ));
          })}
        </ul>
      ) : (
        <p className="pt-5 text-[1rem] leading-relaxed text-ink-dim">
          {date === null ? "Nothing logged yet today." : "Nothing logged that day."}
        </p>
      )}

      <button onClick={() => setPartner(true)} className="mt-3 flex h-11 w-full items-center text-left">
        <SideLine side={day.partner} />
      </button>

      {day.me.entries.length && !picking ? (
        <button onClick={() => setPicking(new Set())} className="mt-1 h-11 text-[0.85rem] text-ink-dim">
          Save some of these as a meal
        </button>
      ) : null}

      {editing ? <EntrySheet entry={editing} onClose={() => setEditing(null)} /> : null}
      {partner ? <PartnerSheet date={day.date} onClose={() => setPartner(false)} /> : null}
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

/** Your partner's day, to look at and nothing more (§1, idea 8): their line, their macros, what they ate. */
function PartnerSheet({ date, onClose }: { date: string; onClose: () => void }) {
  const [theirs, setTheirs] = useState<HealthDayView["me"] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/day?who=partner&date=${date}`, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json: HealthDayView) => live && setTheirs(json.me))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [date]);

  return (
    <Sheet onClose={onClose}>
      {theirs ? (
        <>
          <SideLine side={theirs} />
          <p className="pt-2 text-[0.85rem] tabular-nums text-ink-dim">
            {formatDay(date)} · protein {fmt(theirs.totals.protein_g, 0)}
            {theirs.target ? `/${fmt(theirs.target.protein_g, 0)}` : ""}g · fat {fmt(theirs.totals.fat_g, 0)}
            {theirs.target ? `/${fmt(theirs.target.fat_g, 0)}` : ""}g · carbs {fmt(theirs.totals.carbs_g, 0)}
            {theirs.target ? `/${fmt(theirs.target.carbs_g, 0)}` : ""}g
          </p>
          {theirs.entries.length ? (
            <ul className="mt-2 min-h-0 flex-1 overflow-y-auto">
              {theirs.entries.map((e) => (
                <li key={e.id} className="flex items-center gap-3 border-b border-hairline py-2.5">
                  <EntryLine entry={e} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="pt-4 text-[1rem] text-ink-dim">Nothing logged.</p>
          )}
        </>
      ) : (
        <p className="py-3 text-[0.95rem] text-ink-dim">{failed ? "Couldn't load their day." : "…"}</p>
      )}
    </Sheet>
  );
}
