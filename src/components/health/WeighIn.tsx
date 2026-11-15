"use client";

import { useEffect, useRef, useState } from "react";
import type { HealthDayView } from "@/lib/health/entries";
import type { MaintenanceView } from "@/lib/health/maintenance";
import type { WeightPoint, WeightTrend, WeightView } from "@/lib/health/weight";
import { formatDay } from "@/lib/health/zone";
import { useHealthDay } from "./HealthDay";
import { colorOf } from "./MacroBar";
import { MaintenanceBlock } from "./Maintenance";
import { Sheet } from "./Sheet";

const kg = (n: number) => n.toFixed(1);
/** "↓0.3", "↑0.2", or "steady": the 7-day average against a week before. */
const moved = (change: number) => (Math.abs(change) < 0.05 ? "steady" : `${change < 0 ? "↓" : "↑"}${kg(Math.abs(change))}`);
const numeric = (raw: string) => raw.replace(/[^\d.,]/g, "").replace(",", ".");
const stepButton =
  "flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-hairline-strong text-[1.4rem] leading-none text-ink disabled:text-ink-faint";

async function send(method: "POST" | "DELETE", date: string, weight?: number): Promise<HealthDayView> {
  const res = await fetch(method === "POST" ? "/api/weight" : `/api/weight?date=${date}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: method === "POST" ? JSON.stringify({ kg: weight, date }) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error ?? "That didn't work");
  return json as HealthDayView;
}

/** A weight with 0.1 kg either side: most mornings it starts within a tap or two of right. */
function Scale({ text, onText }: { text: string; onText: (t: string) => void }) {
  const n = Number(text);
  const ok = text !== "" && Number.isFinite(n);
  const move = (by: number) => onText(kg(Math.round((n + by) * 10) / 10));
  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <button aria-label="0.1 kg less" disabled={!ok} onClick={() => move(-0.1)} className={stepButton}>
        −
      </button>
      <label className="flex min-w-0 flex-1 items-baseline justify-center gap-1.5 rounded-[10px] border border-hairline bg-ground-sunk px-2 py-1.5">
        <input
          aria-label="Weight in kilograms"
          inputMode="decimal"
          value={text}
          placeholder="0.0"
          onChange={(e) => onText(numeric(e.target.value))}
          className="w-16 min-w-0 bg-transparent text-right text-[1.4rem] font-bold tabular-nums text-ink placeholder:text-ink-faint focus:outline-none"
        />
        <span className="text-[0.9rem] text-ink-dim">kg</span>
      </label>
      <button aria-label="0.1 kg more" disabled={!ok} onClick={() => move(0.1)} className={stepButton}>
        +
      </button>
    </div>
  );
}

const valid = (text: string) => {
  const n = Number(text);
  return text !== "" && Number.isFinite(n) && n >= 20 && n <= 400 ? n : null;
};

/**
 * The weigh-in on Home (§6.2, §8). Until the day on show has one it is a
 * card at the top of the list, starting from the last weight so a morning is
 * a tap or two and Log. After that it is one quiet line: the weight, the
 * 7-day average and how that has moved in a week. The line opens the trend.
 * A past day shows the same card for that day, so a missed morning can be
 * filled in. Each of us sees and logs only our own.
 */
export function WeighIn() {
  const { day, date, setDay, toast } = useHealthDay();
  const w = day.weight;
  const [trend, setTrend] = useState(false);

  return (
    <>
      {w.kg === null ? (
        <Card key={`${day.date}-${w.last?.kg ?? ""}`} day={day.date} past={date !== null} w={w} onTrend={() => setTrend(true)} onDay={setDay} toast={toast} />
      ) : (
        <button onClick={() => setTrend(true)} className="flex h-11 w-full items-baseline gap-2 border-b border-hairline text-left">
          <span className="w-11 shrink-0 text-[0.8rem] text-ink-dim">Weight</span>
          <span className="text-[1rem] tabular-nums">{kg(w.kg)} kg</span>
          <span className="min-w-0 flex-1 truncate text-right text-[0.85rem] tabular-nums text-ink-dim">
            {w.avg !== null ? `7-day ${kg(w.avg)}` : ""}
            {w.change !== null ? ` · ${moved(w.change)} on last week` : ""}
          </span>
        </button>
      )}
      {trend ? <TrendSheet day={day.date} w={w} onDay={setDay} onClose={() => setTrend(false)} /> : null}
    </>
  );
}

function Card({
  day,
  past,
  w,
  onTrend,
  onDay,
  toast,
}: {
  day: string;
  past: boolean;
  w: WeightView;
  onTrend: () => void;
  onDay: (d: HealthDayView) => void;
  toast: ReturnType<typeof useHealthDay>["toast"];
}) {
  const [text, setText] = useState(w.last ? kg(w.last.kg) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = valid(text);

  async function log() {
    if (n === null) return;
    setBusy(true);
    setError(null);
    try {
      onDay(await send("POST", day, n));
      toast({ text: `Weighed in at ${kg(n)} kg`, undo: async () => onDay(await send("DELETE", day)) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  return (
    <section aria-label="Weigh in" className="mt-3 rounded-xl border border-hairline-strong bg-ground-raised px-3.5 py-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[1rem]">{past ? `Weigh-in for ${formatDay(day)}` : "Weigh in"}</h2>
        {w.last ? (
          <button onClick={onTrend} className="text-[0.85rem] text-ink-dim underline decoration-hairline-strong underline-offset-4">
            Trend
          </button>
        ) : null}
      </div>
      <p className="pb-2.5 text-[0.8rem] text-ink-dim">{w.last ? `Last: ${kg(w.last.kg)} kg on ${formatDay(w.last.date)}` : "First one: type what the scale says."}</p>
      <div className="flex items-center gap-2">
        <Scale text={text} onText={setText} />
        <button onClick={log} disabled={busy || n === null} className="h-11 shrink-0 rounded-xl bg-ink px-5 text-[1rem] font-bold text-ground disabled:opacity-50">
          {busy ? "…" : "Log"}
        </button>
      </div>
      {error ? <p className="pt-2 text-[0.85rem] text-ink-dim">{error}</p> : null}
    </section>
  );
}

const W = 320;
const H = 150;
const PAD = { l: 34, r: 10, t: 10, b: 20 };

/**
 * Eight weeks of weigh-ins: each morning a small dot, and the 7-day average
 * as the line to read. One scale, in kilograms, fitted to the data, because
 * the changes that matter are tenths. Touching the chart reads out a day.
 */
function Chart({ points, today, color, perWeek }: { points: WeightPoint[]; today: string; color: string; /** Where the average is headed, kg a week, if known. */ perWeek: number | null }) {
  const [at, setAt] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const dayNo = (d: string) => Math.round(new Date(`${d}T00:00:00Z`).getTime() / 86_400_000);
  const now = dayNo(today);
  const latest = points[points.length - 1];
  // Four weeks ahead at the current target, by the maintenance estimate (§6.3).
  const ahead = perWeek === null ? null : { day: now + 28, kg: latest.avg + perWeek * 4 };
  const end = ahead ? ahead.day : now;
  const start = Math.min(now - 13, dayNo(points[0].date));
  const all = [...points.flatMap((p) => [p.kg, p.avg]), ...(ahead ? [ahead.kg] : [])];
  const lo = Math.floor(Math.min(...all) - 0.3);
  const hi = Math.ceil(Math.max(...all) + 0.3);
  const xAt = (n: number) => PAD.l + ((n - start) / (end - start)) * (W - PAD.l - PAD.r);
  const x = (d: string) => xAt(dayNo(d));
  const y = (v: number) => PAD.t + ((hi - v) / (hi - lo)) * (H - PAD.t - PAD.b);
  const ticks = hi - lo <= 4 ? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) : [lo, Math.round((lo + hi) / 2), hi];
  const shown = points[at ?? points.length - 1];

  const pick = (clientX: number) => {
    const box = svg.current?.getBoundingClientRect();
    if (!box) return;
    const px = ((clientX - box.left) / box.width) * W;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    });
    setAt(best);
  };

  return (
    <div>
      <p className="h-6 text-[0.9rem] tabular-nums">
        {formatDay(shown.date)} · {kg(shown.kg)} kg <span className="text-ink-dim">· 7-day {kg(shown.avg)}</span>
      </p>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`Weight over the last eight weeks. Latest ${kg(points[points.length - 1].kg)} kg, 7-day average ${kg(points[points.length - 1].avg)} kg.`}
        className="w-full touch-none select-none"
        onPointerDown={(e) => pick(e.clientX)}
        onPointerMove={(e) => (e.pointerType === "mouse" || e.buttons ? pick(e.clientX) : undefined)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--hairline)" strokeWidth="1" />
            <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" fontSize="10" fill="var(--ink-faint)">
              {t}
            </text>
          </g>
        ))}
        <text x={PAD.l} y={H - 5} fontSize="10" fill="var(--ink-faint)">
          {formatDay(points[0].date).slice(4)}
        </text>
        <text x={xAt(now)} y={H - 5} textAnchor={ahead ? "middle" : "end"} fontSize="10" fill="var(--ink-faint)">
          today
        </text>
        {ahead ? (
          <>
            <text x={W - PAD.r} y={H - 5} textAnchor="end" fontSize="10" fill="var(--ink-faint)">
              +4 weeks
            </text>
            <line x1={x(latest.date)} y1={y(latest.avg)} x2={xAt(ahead.day)} y2={y(ahead.kg)} stroke={color} strokeWidth="2" strokeDasharray="2 5" strokeLinecap="round" />
            <text x={W - PAD.r} y={y(ahead.kg) - 6} textAnchor="end" fontSize="10" fill="var(--ink-dim)">
              {kg(ahead.kg)}
            </text>
          </>
        ) : null}
        <line x1={x(shown.date)} x2={x(shown.date)} y1={PAD.t} y2={H - PAD.b} stroke="var(--hairline-strong)" strokeWidth="1" />
        <polyline
          points={points.map((p) => `${x(p.date).toFixed(1)},${y(p.avg).toFixed(1)}`).join(" ")}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p) => (
          <circle key={p.date} cx={x(p.date)} cy={y(p.kg)} r="2.2" fill="var(--ink-dim)" />
        ))}
        <circle cx={x(shown.date)} cy={y(shown.kg)} r="4" fill="var(--ink)" stroke="var(--ground-raised)" strokeWidth="2" />
      </svg>
      <p className="flex items-center gap-4 pt-1 text-[0.8rem] text-ink-dim">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-[2px] w-4 rounded-full" style={{ background: color }} />
          7-day average
        </span>
        <span className="flex items-center gap-1.5">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-ink-dim" />
          each morning
        </span>
        {ahead ? (
          <span className="flex items-center gap-1.5">
            <span aria-hidden className="w-4 border-t-2 border-dotted" style={{ borderColor: color }} />
            at this target
          </span>
        ) : null}
      </p>
    </div>
  );
}

/** The trend, and the place to correct or take back the weigh-in for the day on show. */
function TrendSheet({ day, w, onDay, onClose }: { day: string; w: WeightView; onDay: (d: HealthDayView) => void; onClose: () => void }) {
  const { day: view } = useHealthDay();
  const [trend, setTrend] = useState<WeightTrend | null>(null);
  const [m, setM] = useState<MaintenanceView | null>(null);
  const [text, setText] = useState(w.kg === null ? "" : kg(w.kg));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = valid(text);

  useEffect(() => {
    let live = true;
    fetch("/api/weight", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json: WeightTrend) => live && setTrend(json))
      .catch(() => live && setError("Couldn't load the trend."));
    fetch("/api/maintenance", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((json: MaintenanceView) => live && setM(json))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [w.kg]);

  async function run(method: "POST" | "DELETE") {
    setBusy(true);
    setError(null);
    try {
      onDay(await send(method, day, n ?? undefined));
      if (method === "DELETE") onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  const points = trend?.points ?? [];
  return (
    <Sheet onClose={onClose} tall>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <p className="text-[1.15rem]">Weight</p>
        <p className="pb-3 text-[0.85rem] text-ink-dim">
          {w.avg !== null ? `7-day average ${kg(w.avg)} kg` : "No weigh-ins this week"}
          {w.change !== null ? ` · ${moved(w.change)}${Math.abs(w.change) < 0.05 ? "" : " kg"} on the week before` : ""}
        </p>
        {points.length >= 2 ? (
          <Chart points={points} today={trend!.today} color={colorOf(view.me.slug)} perWeek={m?.forecastKgWeek ?? null} />
        ) : trend ? (
          <p className="text-[0.95rem] leading-relaxed text-ink-dim">The trend line starts once there are two weigh-ins.</p>
        ) : null}

        {w.kg !== null ? (
          <>
            <p className="pt-5 pb-1.5 text-[0.8rem] text-ink-faint">{formatDay(day)}</p>
            <div className="flex items-center gap-2">
              <Scale text={text} onText={setText} />
              <button onClick={() => run("POST")} disabled={busy || n === null || n === w.kg} className="h-11 shrink-0 rounded-xl border border-hairline-strong px-4 text-[0.95rem] text-ink disabled:text-ink-faint">
                Save
              </button>
            </div>
            <button onClick={() => run("DELETE")} disabled={busy} className="mt-1 h-10 text-[0.85rem] text-danger">
              Remove this weigh-in
            </button>
          </>
        ) : null}
        {error ? <p className="pt-2 text-[0.85rem] text-ink-dim">{error}</p> : null}

        {m ? <MaintenanceBlock m={m} onChange={setM} /> : null}

        {points.length ? (
          <>
            <p className="pt-4 pb-1 text-[0.8rem] text-ink-faint">Weigh-ins</p>
            <ul>
              {[...points].reverse().map((p) => (
                <li key={p.date} className="flex items-baseline gap-2 border-b border-hairline py-2 text-[0.95rem] tabular-nums">
                  <span className="w-28 shrink-0 text-ink-dim">{formatDay(p.date)}</span>
                  <span className="flex-1">{kg(p.kg)} kg</span>
                  <span className="text-[0.85rem] text-ink-dim">7-day {kg(p.avg)}</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </div>
    </Sheet>
  );
}
