"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * A sheet that rises from the bottom over a dimmed screen, the same shape as
 * the photo upload confirmation. Tapping the dimmed area closes it.
 *
 * Rendered into <body>: opened from inside the macro bar, whose backdrop blur
 * makes it the frame for anything fixed inside it, a sheet would otherwise
 * be clipped to the bar.
 */
export function Sheet({ onClose, children }: { onClose: () => void; children: React.ReactNode }) {
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

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-ground-sunk/90 backdrop-blur-sm" onClick={onClose}>
      <div
        className="mx-auto flex max-h-[88dvh] w-full max-w-2xl flex-col rounded-t-[18px] border-t border-hairline-strong bg-ground px-4 pt-4"
        style={{ paddingBottom: "calc(var(--safe-bottom) + 1rem)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
