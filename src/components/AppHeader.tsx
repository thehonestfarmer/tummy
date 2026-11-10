"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { formatDay, shiftDate } from "@/lib/health/zone";
import { phoneToday, useHealthDay } from "./health/HealthDay";

const iconButton = "flex h-11 w-11 items-center justify-center text-ink-dim";

function Chevron({ back }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={back ? "M15 5l-7 7 7 7" : "M9 5l7 7-7 7"} />
    </svg>
  );
}

/**
 * The line above the macro display (§3, Navigation). On Home it is the day on
 * show, with a way back through past days and a calendar behind the date.
 * Everywhere else it is the way back to Home. The fridge and settings are
 * always on the right.
 */
export function AppHeader() {
  const home = usePathname() === "/today";
  const { day, date, setDate } = useHealthDay();

  return (
    <header className="flex items-center justify-between px-2 pt-3">
      {home ? (
        <div className="flex items-center">
          <button aria-label="The day before" onClick={() => setDate(shiftDate(day.date, -1))} className={iconButton}>
            <Chevron back />
          </button>
          {/* The native date input sits invisibly over the label, so a tap on the date opens the phone's own calendar. */}
          <label className="relative flex h-11 items-center px-1 text-[1.05rem] font-semibold">
            {date === null ? `Today, ${formatDay(day.date)}` : formatDay(day.date)}
            <input
              type="date"
              aria-label="Go to a day"
              value={day.date}
              // Today's own date while today is on show, so the server and the first client render agree.
              max={date === null ? day.date : phoneToday()}
              onChange={(e) => e.target.value && setDate(e.target.value)}
              className="absolute inset-0 h-full w-full opacity-0"
            />
          </label>
          {date !== null ? (
            <>
              <button aria-label="The day after" onClick={() => setDate(shiftDate(day.date, 1))} className={iconButton}>
                <Chevron />
              </button>
              <button onClick={() => setDate(null)} className="h-11 px-2 text-[0.9rem] text-ink-dim">
                Today
              </button>
            </>
          ) : null}
        </div>
      ) : (
        <Link href="/today" className="flex h-11 items-center gap-1 pr-3 text-[1.05rem] text-ink-dim">
          <Chevron back />
          Home
        </Link>
      )}
      <div className="flex items-center">
        <Link href="/library" aria-label="Foods" className={iconButton}>
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="6" y="3" width="12" height="18" rx="2" />
            <path d="M6 10h12M9.5 6v1.5M9.5 13v3" />
          </svg>
        </Link>
        <Link href="/settings" aria-label="Settings" className={iconButton}>
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.9 2.9l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.9-2.9l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.9-2.9l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.9 2.9l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
          </svg>
        </Link>
      </div>
    </header>
  );
}
