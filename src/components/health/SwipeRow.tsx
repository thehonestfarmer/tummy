"use client";

import { useEffect, useRef } from "react";

/** How far a row slides to show its Remove button. */
const REVEAL = 80;
/** Swipe past this share of the row and it is removed without a second tap. */
const FULL = 0.6;
const EASE = "transform 260ms cubic-bezier(0.32, 0.72, 0, 1)";

/**
 * A list row that slides left to show a Remove button, the way a row does in
 * iOS Mail or Messages: a short swipe leaves the button showing for a tap,
 * and a long one removes the row outright. A tap on a row that is slid open
 * closes it rather than opening it, and only one row is open at a time, which
 * the list above keeps track of.
 *
 * The slide is written straight to the element instead of through state, so
 * a finger never waits on a render.
 */
export function SwipeRow({
  open,
  onOpenChange,
  onTap,
  onRemove,
  label,
  disabled,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onTap: () => void;
  /** Resolves false when the removal failed, and the row slides back. */
  onRemove: () => Promise<boolean>;
  /** What Remove says to a screen reader: "Remove banana". */
  label: string;
  /** No swiping, as when the rows are being picked. */
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const row = useRef<HTMLDivElement>(null);
  const well = useRef<HTMLButtonElement>(null);
  const drag = useRef<{ x: number; y: number; from: number; way: "x" | "y" | null; moved: boolean } | null>(null);
  const offset = useRef(0);
  /** Set by a swipe, so the click that a lifted finger sends is not taken for a tap. */
  const swiped = useRef(false);

  const slide = (x: number, animate: boolean) => {
    offset.current = x;
    if (row.current) {
      row.current.style.transition = animate ? EASE : "none";
      row.current.style.transform = x ? `translateX(${x}px)` : "";
    }
    if (well.current) {
      // The button grows with the swipe, so a long pull fills the row with red.
      well.current.style.transition = animate ? "width 260ms cubic-bezier(0.32, 0.72, 0, 1)" : "none";
      well.current.style.width = `${Math.max(0, -x)}px`;
    }
  };

  // Follow the list: another row opening, or a scroll, closes this one.
  useEffect(() => {
    slide(open ? -REVEAL : 0, true);
  }, [open]);

  const remove = () => {
    slide(-(row.current?.offsetWidth ?? 400), true);
    void onRemove().then((gone) => gone || slide(0, true));
  };

  return (
    <div className="relative -mx-5 overflow-hidden">
      <button
        ref={well}
        aria-label={label}
        tabIndex={open ? 0 : -1}
        onClick={remove}
        className="absolute inset-y-0 right-0 flex w-0 items-center justify-center overflow-hidden bg-danger text-white"
      >
        <svg viewBox="0 0 24 24" className="h-[22px] w-[22px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V4h6v3" />
        </svg>
      </button>
      <div
        ref={row}
        className="relative touch-pan-y bg-ground px-5"
        onPointerDown={(e) => {
          if (disabled || (e.pointerType === "mouse" && e.button !== 0)) return;
          drag.current = { x: e.clientX, y: e.clientY, from: offset.current, way: null, moved: false };
        }}
        onPointerMove={(e) => {
          const d = drag.current;
          if (!d) return;
          const dx = e.clientX - d.x;
          const dy = e.clientY - d.y;
          if (d.way === null) {
            if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
            d.way = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
            if (d.way === "x") e.currentTarget.setPointerCapture(e.pointerId);
          }
          if (d.way !== "x") return;
          d.moved = true;
          // Past the right edge there is nothing to show, so it resists rather than follows.
          const x = d.from + dx;
          slide(x > 0 ? x / 6 : x, false);
        }}
        onPointerUp={() => {
          const d = drag.current;
          drag.current = null;
          if (!d || d.way !== "x") return;
          swiped.current = true;
          setTimeout(() => (swiped.current = false), 50);
          const width = row.current?.offsetWidth ?? 400;
          if (-offset.current > width * FULL) return remove();
          const show = -offset.current > REVEAL / 2;
          slide(show ? -REVEAL : 0, true);
          if (show !== open) onOpenChange(show);
        }}
        onPointerCancel={() => {
          drag.current = null;
          slide(open ? -REVEAL : 0, true);
        }}
        onClickCapture={(e) => {
          // The click that ends a swipe is not a tap, and a tap on an open row only closes it.
          if (swiped.current || offset.current !== 0 || open) {
            e.stopPropagation();
            e.preventDefault();
            if (open) onOpenChange(false);
          }
        }}
        onClick={onTap}
      >
        {children}
      </div>
    </div>
  );
}
