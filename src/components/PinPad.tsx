"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Mark } from "./Mark";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

/** No "who are you?" step. The PIN is the identity. */
export function PinPad() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  // "" when all is well; otherwise the line to show under the pad. A failed
  // fetch is not a failed PIN — telling her the number is wrong when the real
  // problem is no signal sends her hunting for a mistake she didn't make.
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const [pressed, setPressed] = useState<number | null>(null);
  const lastPointer = useRef(0);

  // Wake the function and the database while the PIN is still being typed;
  // otherwise a cold start lands squarely on the fourth digit.
  useEffect(() => {
    const t = setTimeout(() => {
      fetch("/api/warm", { cache: "no-store" }).catch(() => {});
    }, 0);
    return () => clearTimeout(t);
  }, []);

  async function submit(value: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: value }),
      });
      if (res.ok) {
        // Through the front door, which knows which mode you were last in.
        router.replace("/");
        router.refresh();
        return;
      }
      setProblem("Not quite.");
    } catch {
      setProblem("No signal. Try again when you're back.");
    }
    setPin("");
    setBusy(false);
  }

  function press(key: string) {
    if (busy || !key) return;
    setProblem("");
    if (key === "del") return setPin((p) => p.slice(0, -1));
    if (pin.length >= 4) return;
    const next = pin + key;
    setPin(next);
    if (next.length === 4) submit(next);
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-8">
      {/* The pair, in the same fixed order as everywhere else. No wordmark —
          the two of you are the only thing this screen needs to say. */}
      <div role="img" aria-label="Tummy" className="flex items-center gap-4 pb-12">
        <Mark slug="bunny" className="h-8 w-8" />
        <Mark slug="bear" className="h-8 w-8" />
      </div>

      <div className={`flex gap-3.5 pb-14 ${busy ? "verifying" : ""}`}>
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className="h-3 w-3 rounded-full border border-hairline-strong"
            style={{
              background: i < pin.length ? "var(--ink)" : "transparent",
              opacity: problem ? 0.4 : 1,
              animationDelay: `${i * 120}ms`,
            }}
          />
        ))}
      </div>

      <div className="grid w-full max-w-[17rem] grid-cols-3 gap-x-6 gap-y-3">
        {KEYS.map((key, i) => (
          <button
            key={i}
            disabled={!key || busy}
            // A keypad should answer the press, not the release.
            onPointerDown={(e) => {
              if (!key || busy) return;
              e.preventDefault();
              lastPointer.current = Date.now();
              setPressed(i);
              press(key);
            }}
            onPointerUp={() => setPressed(null)}
            onPointerCancel={() => setPressed(null)}
            onPointerLeave={() => setPressed(null)}
            // Keyboard activation only — pointer input already fired above.
            onClick={() => {
              if (Date.now() - lastPointer.current < 700) return;
              press(key);
            }}
            // The blank filler key is invisible; the rest merely dim while the
            // server is checking, rather than vanishing out from under you.
            style={{ opacity: key ? (busy ? 0.3 : 1) : 0 }}
            className="relative flex h-16 items-center justify-center transition-opacity duration-150"
          >
            <span
              aria-hidden
              className="absolute h-14 w-14 rounded-full"
              style={{ background: pressed === i ? "var(--ground-raised)" : "transparent" }}
            />
            <span
              className="relative text-[1.5rem] text-ink"
              style={key === "del" ? { fontSize: "1rem", color: "var(--ink-faint)" } : undefined}
            >
              {key === "del" ? "delete" : key}
            </span>
          </button>
        ))}
      </div>

      <p className="min-h-6 px-6 pt-8 text-center text-[0.9rem] text-ink-faint">{problem}</p>
    </div>
  );
}
