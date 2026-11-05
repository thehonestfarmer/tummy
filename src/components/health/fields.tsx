"use client";

import { useState } from "react";

/** Trailing zeros only where they say something: 41, 7.1, never 41.0. */
export function fmt(n: number, places = 1): string {
  const factor = 10 ** places;
  return String(Math.round(n * factor) / factor);
}

const inputClass =
  "w-full min-w-0 rounded-[3px] border border-hairline bg-ground-sunk px-2.5 py-2 text-[0.95rem] text-ink " +
  "placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none";

function Label({ text, hint }: { text: string; hint?: string }) {
  return (
    <>
      <span className="block pb-1 text-[0.8rem] text-ink-faint">{text}</span>
      {hint ? <span className="order-last block pt-1 text-[0.8rem] text-ink-dim">{hint}</span> : null}
    </>
  );
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col">
      <Label text={label} hint={hint} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass} />
    </label>
  );
}

/**
 * Holds the text as typed, so "7." or an emptied box survive a re-render, and
 * reports a number, or null when the box is empty.
 */
export function NumberField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  hint?: string;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  return (
    <label className="flex min-w-0 flex-col">
      <Label text={label} hint={hint} />
      <input
        inputMode="decimal"
        value={text}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.,]/g, "").replace(",", ".");
          setText(raw);
          const num = raw === "" ? null : Number(raw);
          if (num === null || Number.isFinite(num)) onChange(num);
        }}
        className={`${inputClass} tabular-nums`}
      />
    </label>
  );
}
