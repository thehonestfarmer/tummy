"use client";

import Link from "next/link";
import { useState } from "react";
import type { LibraryView } from "@/lib/health/foods";
import { fmt } from "./fields";

const keyOf = (s: string | null | undefined) => (s ?? "").normalize("NFKC").toLowerCase();

/**
 * Every confirmed food, searchable in either language. Small enough to send
 * whole and filter on the phone, so search costs no round trip.
 */
export function LibraryClient({ initial }: { initial: LibraryView }) {
  const [query, setQuery] = useState("");
  const q = keyOf(query.trim());
  const foods = q
    ? initial.foods.filter((f) => [f.name, f.nameJa, f.brand, ...f.aliases].some((s) => keyOf(s).includes(q)))
    : initial.foods;

  return (
    <div className="px-5 pt-3 pb-6">
      <header className="flex items-baseline">
        <h1 className="text-[1.15rem] leading-none">Library</h1>
        <Link href="/add" className="ml-auto text-[0.9rem] text-ink-dim">
          Add foods
        </Link>
      </header>
      {initial.drafts ? (
        <p className="pt-2 text-[0.95rem] text-ink-dim">
          <Link href="/review" className="text-ink underline decoration-hairline-strong underline-offset-4">
            {initial.drafts} waiting for review
          </Link>
        </p>
      ) : null}

      {initial.foods.length ? (
        <>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search"
            className="mt-4 w-full rounded-[10px] border border-hairline bg-ground-sunk px-3 py-2.5 text-[1rem] text-ink placeholder:text-ink-faint focus:border-hairline-strong focus:outline-none"
          />
          <ul className="pt-2">
            {foods.map((f) => (
              <li key={f.id} className="border-b border-hairline">
                <Link href={`/library/${f.id}`} className="block py-3">
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 truncate text-[1rem]">{f.name}</span>
                    {f.nameJa ? <span className="min-w-0 truncate text-[0.85rem] text-ink-faint">{f.nameJa}</span> : null}
                    <span className="ml-auto shrink-0 text-[0.9rem] tabular-nums text-ink-dim">{fmt(f.per100.kcal, 0)} kcal</span>
                  </span>
                  <span className="block pt-0.5 text-[0.85rem] tabular-nums text-ink-faint">
                    per 100g · P {fmt(f.per100.protein_g)} · F {fmt(f.per100.fat_g)} · C {fmt(f.per100.carbs_g)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {!foods.length ? <p className="pt-4 text-[0.95rem] text-ink-dim">Nothing called that yet.</p> : null}
        </>
      ) : (
        <p className="pt-3 text-[1.05rem] leading-relaxed text-ink-dim">
          Nothing confirmed yet.{" "}
          <Link href="/add" className="text-ink underline decoration-hairline-strong underline-offset-4">
            Photograph the kitchen
          </Link>{" "}
          to start the library.
        </p>
      )}
    </div>
  );
}
