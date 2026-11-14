"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

/** Pull the sheet down this far, or flick it, and it closes. */
const DISMISS_PX = 90;
const CLOSE_MS = 220;

/**
 * A drawer that slides up from the bottom over a dimmed screen. Tapping the
 * dimmed area closes it, and so does pulling it down by the handle.
 *
 * Rendered into <body>: opened from inside the macro bar, whose backdrop blur
 * makes it the frame for anything fixed inside it, a sheet would otherwise
 * be clipped to the bar.
 *
 * Callers close a sheet by no longer rendering it, which gives React nothing
 * to animate. So on the way out the sheet leaves a lifeless copy of itself
 * behind to slide away, and every close looks the same whoever asked for it.
 */
export function Sheet({
  onClose,
  tall,
  children,
}: {
  onClose: () => void;
  /** Full height from the start, for a sheet whose contents load or change: it rises once and never resizes. */
  tall?: boolean;
  children: React.ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; at: number } | null>(null);

  useEffect(() => {
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  useLayoutEffect(() => {
    const node = root.current;
    const opened = performance.now();
    return () => {
      // Development mounts everything twice; a sheet gone this fast was never seen.
      if (!node || performance.now() - opened < 100) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const ghost = node.cloneNode(true) as HTMLElement;
      ghost.classList.add("sheet-closing");
      ghost.setAttribute("aria-hidden", "true");
      document.body.appendChild(ghost);
      setTimeout(() => ghost.remove(), CLOSE_MS);
    };
  }, []);

  const move = (y: number) => {
    if (panel.current) panel.current.style.transform = y ? `translateY(${y}px)` : "";
  };

  return createPortal(
    <div ref={root} className="sheet-scrim fixed inset-0 z-50 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div
        ref={panel}
        className={`sheet-panel mx-auto flex w-full ${tall ? "h-[88dvh]" : "max-h-[88dvh]"} max-w-2xl flex-col rounded-t-[18px] border-t border-hairline-strong bg-ground px-4`}
        style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          aria-hidden
          className="-mx-4 flex h-7 shrink-0 touch-none items-center justify-center"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            drag.current = { y: e.clientY, at: e.timeStamp };
            if (panel.current) panel.current.style.transition = "none";
          }}
          onPointerMove={(e) => drag.current && move(Math.max(0, e.clientY - drag.current.y))}
          onPointerUp={(e) => {
            if (!drag.current) return;
            const by = Math.max(0, e.clientY - drag.current.y);
            const flick = by > 30 && by / Math.max(1, e.timeStamp - drag.current.at) > 0.5;
            drag.current = null;
            if (by > DISMISS_PX || flick) return onClose();
            if (panel.current) panel.current.style.transition = "transform 200ms ease-out";
            move(0);
          }}
          onPointerCancel={() => {
            drag.current = null;
            move(0);
          }}
        >
          <span className="h-1 w-9 rounded-full bg-hairline-strong" />
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
