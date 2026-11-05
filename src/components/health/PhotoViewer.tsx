"use client";

import { useState } from "react";

/**
 * The packet's photos, small enough to keep the form on screen, and full
 * size on a tap. The app turns off pinch zoom, so the full view is the
 * image at its own pixel size in a scrolling box: pan to the bit you need.
 */
export function PhotoViewer({ images }: { images: string[] }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <>
      <div className="flex gap-2 pt-3">
        {images.map((src) => (
          <button key={src} onClick={() => setOpen(src)} className="min-w-0 flex-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={src} alt="" className="h-56 w-full rounded-[2px] border border-hairline object-contain bg-ground-sunk" />
          </button>
        ))}
      </div>
      {open ? (
        <div className="fixed inset-0 z-50 flex flex-col bg-ground-sunk">
          <div className="flex justify-end px-4 py-3" style={{ paddingTop: "calc(var(--safe-top) + 0.75rem)" }}>
            <button onClick={() => setOpen(null)} className="text-[0.95rem] text-ink-dim">
              Close
            </button>
          </div>
          <div className="flex-1 overflow-auto">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={open} alt="" className="max-w-none" />
          </div>
        </div>
      ) : null}
    </>
  );
}
