"use client";

import { useRef, useState } from "react";
import type { HealthDayView } from "@/lib/health/entries";
import type { RunShot, RunView } from "@/lib/health/runs";
import { formatDay } from "@/lib/health/zone";
import { prepare } from "@/lib/resize";
import { phoneToday, useHealthDay } from "./HealthDay";
import { Sheet } from "./Sheet";

const whole = (n: number) => Math.round(n).toLocaleString("en-US");

/** "45:10" or "1:02:33" from seconds. */
export function clock(seconds: number): string {
  const s = Math.round(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rest = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${rest}` : `${m}:${rest}`;
}

/** Seconds from "45:10", "1:02:33" or plain minutes; null when it isn't a time. */
function seconds(text: string): number | null {
  const parts = text.trim().split(":").map((p) => Number(p));
  if (!text.trim() || parts.some((p) => !Number.isFinite(p) || p < 0)) return null;
  const total = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : parts[0] * 60;
  return total > 0 ? Math.round(total) : null;
}

export const runLine = (r: RunView) => `${r.km} km${r.seconds ? ` · ${clock(r.seconds)}` : ""}`;

const field =
  "h-11 w-full min-w-0 rounded-[10px] border border-hairline bg-ground-sunk px-3 text-[1rem] tabular-nums text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none";

/**
 * Adding a run (§7.6). There is no connection to Strava, so the run comes
 * from a screenshot of the activity: Claude reads the date, distance, time
 * and calories, they land in the boxes to be checked, and Log saves them.
 * The boxes can be typed into as well. The run's calories go onto that
 * day's target.
 */
export function AddRunSheet({ onClose, onLogged }: { onClose: () => void; onLogged?: () => void }) {
  const { day: shown, setDay, toast } = useHealthDay();
  const picker = useRef<HTMLInputElement>(null);
  const [date, setDate] = useState(phoneToday());
  const [km, setKm] = useState("");
  const [time, setTime] = useState("");
  const [kcal, setKcal] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const [read, setRead] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function onShot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReading(true);
    setNote(null);
    try {
      const { blob } = await prepare(file);
      const res = await fetch("/api/runs/read", { method: "POST", headers: { "Content-Type": "image/jpeg" }, body: blob });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Couldn't read that screenshot");
      const shot = json as RunShot;
      if (!shot.is_run) {
        setNote(`That looks like ${shot.activity || "something else"}, not a run. Only runs change the day's target.`);
        return;
      }
      if (shot.date && shot.date <= phoneToday()) setDate(shot.date);
      setKm(shot.distance_km ? String(Math.round(shot.distance_km * 100) / 100) : "");
      setTime(shot.moving_seconds ? clock(shot.moving_seconds) : "");
      setKcal(shot.calories ? String(Math.round(shot.calories)) : "");
      setName(shot.activity || null);
      setRead(true);
      setNote(shot.calories ? "Read from the screenshot. Check it, then log." : "Read from the screenshot. It shows no calories, so they'll be worked out from your weight and the distance.");
    } catch (err) {
      setNote(err instanceof Error ? err.message : "Couldn't read that screenshot");
    } finally {
      setReading(false);
    }
  }

  const distance = Number(km);
  const ok = km !== "" && Number.isFinite(distance) && distance > 0 && (time === "" || seconds(time) !== null);

  async function log() {
    if (!ok) return;
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, km: distance, seconds: seconds(time), kcal: kcal === "" ? null : Number(kcal), name, fromShot: read }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "That didn't work");
      const { run, day } = json as { run: RunView; day: HealthDayView };
      // A run from another day leaves the day on show as it is.
      if (day.date === shown.date) setDay(day);
      onLogged?.();
      onClose();
      toast({ text: `Run logged · ${whole(run.kcal)} kcal added to ${run.date === phoneToday() ? "today's" : `${formatDay(run.date)}'s`} target` });
    } catch (err) {
      setNote(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  return (
    <Sheet onClose={onClose}>
      <input ref={picker} type="file" accept="image/*" onChange={onShot} className="hidden" />
      <p className="text-[1.15rem]">Add a run</p>
      <p className="pb-3 text-[0.85rem] leading-relaxed text-ink-dim">Its calories are added to that day&rsquo;s target.</p>
      <button
        onClick={() => picker.current?.click()}
        disabled={reading}
        className="h-12 w-full rounded-xl border border-hairline-strong bg-ground-raised text-[1rem] text-ink disabled:text-ink-faint"
      >
        {reading ? "Reading the screenshot…" : read ? "Choose another screenshot" : "Choose a Strava screenshot"}
      </button>
      <div className="grid grid-cols-2 gap-2 pt-4">
        <label className="flex flex-col">
          <span className="pb-1 text-[0.8rem] text-ink-faint">Day</span>
          <input type="date" aria-label="Day" value={date} max={phoneToday()} onChange={(e) => e.target.value && setDate(e.target.value)} className={field} />
        </label>
        <label className="flex flex-col">
          <span className="pb-1 text-[0.8rem] text-ink-faint">Distance, km</span>
          <input aria-label="Distance in kilometres" inputMode="decimal" value={km} onChange={(e) => setKm(e.target.value.replace(/[^\d.,]/g, "").replace(",", "."))} placeholder="8.2" className={field} />
        </label>
        <label className="flex flex-col">
          <span className="pb-1 text-[0.8rem] text-ink-faint">Moving time</span>
          <input aria-label="Moving time" inputMode="text" value={time} onChange={(e) => setTime(e.target.value.replace(/[^\d:]/g, ""))} placeholder="45:10" className={field} />
        </label>
        <label className="flex flex-col">
          <span className="pb-1 text-[0.8rem] text-ink-faint">Calories, if shown</span>
          <input aria-label="Calories" inputMode="numeric" value={kcal} onChange={(e) => setKcal(e.target.value.replace(/\D/g, ""))} placeholder="from weight" className={field} />
        </label>
      </div>
      {note ? <p className="pt-3 text-[0.85rem] leading-relaxed text-ink-dim">{note}</p> : null}
      <button onClick={log} disabled={busy || reading || !ok} className="mt-4 h-14 w-full rounded-xl bg-ink text-[1.05rem] font-bold text-ground disabled:opacity-50">
        {busy ? "…" : "Log run"}
      </button>
    </Sheet>
  );
}

/**
 * The day's runs on Home, one line each, with what they added to the
 * target. A line opens to take the run back out.
 */
export function RunLines() {
  const { day, setDay, toast } = useHealthDay();
  const [open, setOpen] = useState<RunView | null>(null);
  const [busy, setBusy] = useState(false);

  async function remove(run: RunView) {
    setBusy(true);
    try {
      const res = await fetch(`/api/runs/${run.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((json as { error?: string }).error ?? "Couldn't remove that");
      setDay(json as HealthDayView);
      setOpen(null);
      toast({ text: "Run removed" });
    } catch (err) {
      toast({ text: err instanceof Error ? err.message : "Couldn't remove that" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {day.me.runs.map((r) => (
        <button key={r.id} onClick={() => setOpen(r)} className="flex h-11 w-full items-baseline gap-2 border-b border-hairline text-left">
          <span className="w-11 shrink-0 text-[0.8rem] text-ink-dim">Run</span>
          <span className="min-w-0 flex-1 truncate text-[1rem] tabular-nums">{runLine(r)}</span>
          <span className="shrink-0 text-[0.85rem] tabular-nums text-ink-dim">+{whole(r.kcal)} kcal</span>
        </button>
      ))}
      {open ? (
        <Sheet onClose={() => setOpen(null)}>
          <p className="text-[1.15rem]">{open.name ?? "Run"}</p>
          <p className="text-[0.9rem] tabular-nums text-ink-dim">
            {formatDay(open.date)} · {runLine(open)}
          </p>
          <p className="pt-3 text-[0.95rem] leading-relaxed">
            {whole(open.kcal)} kcal added to this day&rsquo;s target, as carbohydrate.{" "}
            <span className="text-ink-dim">{open.kcalFrom === "strava" ? "Strava's figure." : "Worked out from your weight and the distance."}</span>
          </p>
          <button onClick={() => remove(open)} disabled={busy} className="mt-5 h-12 w-full rounded-xl border border-hairline text-[1rem] text-danger">
            {busy ? "…" : "Remove this run"}
          </button>
        </Sheet>
      ) : null}
    </>
  );
}
