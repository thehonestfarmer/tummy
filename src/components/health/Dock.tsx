"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { WorkoutView } from "@/lib/health/workout";
import { usePoll } from "@/lib/usePoll";
import { formatDay } from "@/lib/health/zone";
import { useHealthDay } from "./HealthDay";
import { FoodSheet } from "./FoodSheet";
import { QuickLog } from "./QuickLog";
import { Sheet } from "./Sheet";
import { StartChooser } from "./Workout";

/**
 * Home's actions, docked at the bottom edge where a thumb reaches (§8): a
 * large Add food and the quick-log mic beside it, and a smaller Start workout
 * above them until you've trained today (§7.4). With a session open it is the
 * way back in; after it, a quiet line saying what you did.
 *
 * On a past day Add food logs into that day, and the mic steps aside: a
 * spoken log is about now.
 */
export function Dock() {
  const home = usePathname() === "/today";
  const { day, date } = useHealthDay();
  const [adding, setAdding] = useState(false);
  const [starting, setStarting] = useState(false);
  const router = useRouter();
  const { data: workout } = usePoll<WorkoutView | null>("/api/workout", 20_000, null);
  const session = workout?.session;
  const inIt = Boolean(session?.open && !session.finished);
  const workoutButton = "flex h-12 w-full items-center justify-center rounded-xl border border-hairline-strong bg-ground-raised text-[1rem] text-ink";

  // Off Home there is nothing to dock, only the phone's own bottom edge to clear.
  if (!home) return <div style={{ height: "var(--safe-bottom)" }} />;

  return (
    <div
      className="border-t border-hairline bg-ground/95 px-4 pt-3 backdrop-blur-sm"
      style={{ paddingBottom: "max(var(--safe-bottom), 0.75rem)" }}
    >
      {date !== null || !workout ? null : inIt ? (
        <Link href="/workout" className={`${workoutButton} mb-2.5`}>
          Back to workout{session?.planName ? ` · ${session.planName}` : ""}
        </Link>
      ) : workout.joinable ? (
        <button onClick={() => setStarting(true)} className={`${workoutButton} mb-2.5`}>
          Join {workout.joinable.by}&rsquo;s workout
        </button>
      ) : workout.trained ? (
        <Link href="/workout" className="mb-2 flex h-8 items-center justify-center text-[0.9rem] text-ink-dim">
          Trained{session?.planName ? ` · ${session.planName}` : ""}
        </Link>
      ) : (
        <button onClick={() => setStarting(true)} className={`${workoutButton} mb-2.5`}>
          Start workout
        </button>
      )}
      <div className="flex gap-2.5">
        <button
          onClick={() => setAdding(true)}
          className="flex h-16 min-w-0 flex-1 items-center justify-center gap-2.5 rounded-xl bg-ink text-[1.2rem] font-bold text-ground"
        >
          <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden>
            <path d="M12 5v14M5 12h14" />
          </svg>
          <span className="truncate">{date === null ? "Add food" : `Add to ${formatDay(day.date)}`}</span>
        </button>
        {date === null ? <QuickLog /> : null}
      </div>
      {adding ? <FoodSheet onClose={() => setAdding(false)} /> : null}
      {starting && workout ? (
        <Sheet onClose={() => setStarting(false)}>
          <StartChooser view={workout} onStarted={() => router.push("/workout")} />
        </Sheet>
      ) : null}
    </div>
  );
}
