"use client";

import Link from "next/link";
import { useState } from "react";
import type { LibraryView } from "@/lib/health/foods";
import type { FridgeItem, FridgeKind, FridgeView } from "@/lib/health/fridge";
import { Sheet } from "./Sheet";
import { NumberField, fmt } from "./fields";

const keyOf = (s: string | null | undefined) => (s ?? "").normalize("NFKC").toLowerCase();

/**
 * The fridge, then every confirmed food (§8). The fridge is what's in the
 * house, with what's left of each; a tap corrects it when it has drifted.
 * The foods are searchable in either language, and small enough to send
 * whole and filter on the phone, so search costs no round trip.
 */
export function LibraryClient({ initial, fridge }: { initial: LibraryView; fridge: FridgeItem[] }) {
  const [query, setQuery] = useState("");
  const [items, setItems] = useState(fridge);
  const [open, setOpen] = useState<FridgeItem | null>(null);
  const q = keyOf(query.trim());
  const foods = q
    ? initial.foods.filter((f) => [f.name, f.nameJa, f.brand, ...f.aliases].some((s) => keyOf(s).includes(q)))
    : initial.foods;

  return (
    <div className="px-5 pt-3 pb-6">
      <header className="flex items-baseline">
        <h1 className="text-[1.15rem] leading-none">Fridge</h1>
        <Link
          href="/add"
          className="ml-auto flex h-10 items-center rounded-full border border-hairline-strong bg-ground-raised px-4 text-[0.95rem] text-ink"
        >
          Stock up
        </Link>
      </header>
      {items.length ? (
        <ul className="pt-2">
          {items.map((item) => (
            <li key={item.food.id} className="border-b border-hairline">
              <button onClick={() => setOpen(item)} className="flex w-full items-baseline gap-2 py-3 text-left">
                <span className="min-w-0 flex-1 truncate text-[1rem]">{item.food.name}</span>
                <span className="shrink-0 text-[0.9rem] tabular-nums text-ink-dim">
                  {item.count ? `${fmt(item.count.n)} left · ` : ""}
                  {fmt(item.left, 0)}g
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pt-3 text-[0.95rem] leading-relaxed text-ink-dim">
          Nothing in the fridge yet. Stock up after a shop, or from Add food pick something and choose Add to fridge.
        </p>
      )}

      <h2 className="pt-8 text-[1.05rem] leading-none">Every food</h2>
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

      {open ? (
        <FridgeItemSheet
          item={open}
          onClose={() => setOpen(null)}
          onChanged={(next) => {
            setItems(next);
            setOpen(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Keeping the fridge honest (§5.10): it drifts, and these are the three ways to say what's really there. */
function FridgeItemSheet({
  item,
  onClose,
  onChanged,
}: {
  item: FridgeItem;
  onClose: () => void;
  onChanged: (items: FridgeItem[]) => void;
}) {
  const [grams, setGrams] = useState<number | null>(Math.round(item.left));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(kind: FridgeKind, amount?: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/fridge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodId: item.food.id, kind, grams: amount }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "That didn't work");
      onChanged((json as FridgeView).items);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
      setBusy(false);
    }
  }

  const quiet = "flex-1 rounded-[10px] border border-hairline py-3 text-[0.95rem] text-ink-dim";
  return (
    <Sheet onClose={onClose}>
      <p className="text-[1.1rem]">{item.food.name}</p>
      <p className="text-[0.85rem] text-ink-dim">
        {item.count ? `${fmt(item.count.n)} left · ` : ""}
        {fmt(item.left, 0)}g in the fridge
      </p>
      <div className="flex items-end gap-2 pt-4">
        <div className="w-32">
          <NumberField label="Really there, in grams" value={grams} onChange={setGrams} />
        </div>
        <button
          disabled={busy || grams === null || grams === Math.round(item.left)}
          onClick={() => grams !== null && send("set", grams)}
          className="flex-1 rounded-[10px] border border-hairline-strong bg-ground-raised py-2.5 text-[0.95rem] text-ink disabled:text-ink-faint"
        >
          Set amount
        </button>
      </div>
      <div className="flex gap-2 pt-3">
        <button disabled={busy} onClick={() => send("finished")} className={quiet}>
          Finished
        </button>
        <button disabled={busy} onClick={() => send("discarded")} className={quiet}>
          Threw it out
        </button>
      </div>
      <Link href={`/library/${item.food.id}`} className="block pt-4 text-center text-[0.9rem] text-ink-dim">
        Fix this food&rsquo;s numbers
      </Link>
      {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </Sheet>
  );
}
