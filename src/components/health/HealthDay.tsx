"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { HealthDayView } from "@/lib/health/entries";
import { dateIn } from "@/lib/health/zone";
import { usePoll } from "@/lib/usePoll";

type Toast = { text: string; undo?: () => Promise<void> };

type HealthDayContext = {
  day: HealthDayView;
  setDay: (day: HealthDayView) => void;
  refresh: () => Promise<void>;
  toast: (t: Toast) => void;
  /** The past day on show, or null for today (§8). */
  date: string | null;
  /** Steps to another day. Today, or anything after it, goes back to following today. */
  setDate: (date: string | null) => void;
};

const Ctx = createContext<HealthDayContext | null>(null);

export function useHealthDay(): HealthDayContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useHealthDay outside HealthDayProvider");
  return ctx;
}

/** How long an undo stays on offer after a log (§5.5). */
const UNDO_MS = 8000;

/** Today on this phone, the same date the server works out from the zone cookie (§4). */
export function phoneToday(): string {
  return dateIn(Intl.DateTimeFormat().resolvedOptions().timeZone);
}

/**
 * The day on show, shared by every screen: the macro display reads it, the
 * Home list reads it, and anything that logs swaps in the refreshed day the
 * server sends back. One poll serves all of them, so the numbers at the top
 * never disagree with the list beneath them.
 *
 * It follows today unless `date` names a past day. Most writes answer with
 * today, so while a past day is on show their answer is dropped and that day
 * is re-read instead.
 */
export function HealthDayProvider({ initial, children }: { initial: HealthDayView; children: React.ReactNode }) {
  const [date, setDateState] = useState<string | null>(null);
  const url = date ? `/api/day?date=${date}` : "/api/day";
  const { data: day, setData, refresh } = usePoll<HealthDayView>(url, 15_000, initial);
  const [current, setCurrent] = useState<Toast | null>(null);
  const [undoing, setUndoing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setDate = useCallback((next: string | null) => {
    setDateState(next !== null && next >= phoneToday() ? null : next);
  }, []);

  const setDay = useCallback(
    (next: HealthDayView) => {
      if (date !== null && next.date !== date) void refresh();
      else setData(next);
    },
    [date, refresh, setData],
  );

  const toast = useCallback((t: Toast) => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent(t);
    timer.current = setTimeout(() => setCurrent(null), UNDO_MS);
  }, []);
  useEffect(() => () => void (timer.current && clearTimeout(timer.current)), []);

  return (
    <Ctx.Provider value={{ day, setDay, refresh, toast, date, setDate }}>
      {children}
      {current ? (
        <div
          className="fixed inset-x-0 z-40 mx-auto flex max-w-2xl justify-center px-3"
          style={{ bottom: "calc(var(--bottom-chrome) + 0.75rem)" }}
        >
          <div className="flex w-full items-center gap-3 rounded-[10px] border border-hairline-strong bg-ground-raised px-4 py-3 text-[0.95rem] shadow-lg">
            <span className="min-w-0 flex-1">{current.text}</span>
            {current.undo ? (
              <button
                disabled={undoing}
                onClick={async () => {
                  setUndoing(true);
                  try {
                    await current.undo!();
                    setCurrent(null);
                  } finally {
                    setUndoing(false);
                  }
                }}
                className="shrink-0 text-ink underline decoration-hairline-strong underline-offset-4"
              >
                {undoing ? "…" : "Undo"}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Ctx.Provider>
  );
}
