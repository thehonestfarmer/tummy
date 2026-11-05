"use client";

import Link from "next/link";
import { useState } from "react";
import { CLIENT_NAMES } from "@/lib/health/client";
import { usePoll } from "@/lib/usePoll";
import type { DraftView, ReviewView } from "@/lib/health/foods";
import {
  CROSS_CHECK_TOLERANCE,
  crossCheckGap,
  differingFields,
  emptyReading,
  implausibility,
  matchesRow,
  normalize,
  PLAUSIBILITY_TOLERANCE,
  type Basis,
  type PrintedField,
  type Reading,
} from "@/lib/health/reading";
import { PhotoViewer } from "./PhotoViewer";
import { NumberField, TextField, fmt } from "./fields";

type Action = "confirm" | "discard" | "merge" | "retry";

/**
 * The review queue (healthspec.md §5.3): drafts one at a time, photo above,
 * what was read below, confirm or correct. Either of you can work it, and
 * it keeps refreshing, so packets still being read drop in as they finish.
 */
export function ReviewClient({ initial }: { initial: ReviewView }) {
  const { data, setData } = usePoll<ReviewView>("/api/review", 5_000, initial);
  const [later, setLater] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ready ones first, so a fresh batch can be worked while the rest are read.
  const order = [...data.drafts].sort((a, b) => Number(a.state === "reading") - Number(b.state === "reading"));
  const pending = order.filter((d) => !later.has(d.id));
  const current = pending[0] ?? order[0] ?? null;

  async function act(action: Action, draft: DraftView, extra: Record<string, unknown> = {}) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, id: draft.id, ...extra }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "That didn't work");
      setData(json as ReviewView);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work");
    } finally {
      setBusy(false);
    }
  }

  function skip(draft: DraftView) {
    const next = new Set(later).add(draft.id);
    // Once everything has been put off, go round again.
    setLater(next.size >= data.drafts.length ? new Set() : next);
    setError(null);
  }

  if (!current) {
    return (
      <div className="px-3 pt-3">
        <h1 className="text-[1.15rem] leading-none">Review</h1>
        <p className="pt-3 text-[1.05rem] leading-relaxed text-ink-dim">
          Nothing waiting.{" "}
          <Link href="/add" className="text-ink underline decoration-hairline-strong underline-offset-4">
            Photograph some packets
          </Link>{" "}
          and they&rsquo;ll be read here.
        </p>
        {data.libraryCount ? (
          <p className="pt-2 text-[0.95rem] text-ink-faint">{data.libraryCount} foods in the library.</p>
        ) : null}
      </div>
    );
  }

  const position = order.indexOf(current) + 1;

  return (
    <div className="px-3 pt-3 pb-6">
      <header className="flex items-baseline gap-2">
        <h1 className="text-[1.15rem] leading-none">Review</h1>
        <span className="text-[0.9rem] text-ink-faint">
          {position} of {order.length}
          {data.reading ? ` · ${data.reading} still being read` : ""}
        </span>
        {order.length > 1 ? (
          <button onClick={() => skip(current)} className="ml-auto text-[0.9rem] text-ink-dim">
            Later
          </button>
        ) : null}
      </header>
      {current.addedBy ? (
        <p className="pt-1.5 text-[0.85rem] text-ink-faint">
          Added by {current.addedBy}
          {/* Read in a chat: there's no photo here, so check it against the packet itself. */}
          {current.client !== "pwa" ? ` in ${CLIENT_NAMES[current.client]}, no photo` : ""}
        </p>
      ) : null}

      <PhotoViewer images={current.images} />

      {current.state === "reading" ? (
        <p className="pt-5 text-[1rem] text-ink-dim">Reading this one…</p>
      ) : current.state === "failed" ? (
        <FailedDraft draft={current} busy={busy} act={act} />
      ) : (
        <DraftForm key={current.id} draft={current} reading={current.reading!} busy={busy} act={act} />
      )}

      {error ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{error}</p> : null}
    </div>
  );
}

function FailedDraft({
  draft,
  busy,
  act,
}: {
  draft: DraftView;
  busy: boolean;
  act: (a: Action, d: DraftView, extra?: Record<string, unknown>) => void;
}) {
  const [manual, setManual] = useState(false);
  if (manual) return <DraftForm draft={draft} reading={emptyReading()} busy={busy} act={act} />;
  return (
    <div className="pt-5">
      <p className="text-[1rem] text-ink-dim">Couldn&rsquo;t read this one. {draft.error}</p>
      <div className="flex gap-2 pt-4">
        <button
          onClick={() => act("retry", draft)}
          disabled={busy}
          className="flex-1 rounded-[3px] border border-hairline-strong bg-ground-raised py-3 text-[0.95rem] text-ink"
        >
          Read it again
        </button>
        <button
          onClick={() => setManual(true)}
          className="flex-1 rounded-[3px] border border-hairline bg-ground-raised py-3 text-[0.95rem] text-ink-dim"
        >
          Type it in
        </button>
      </div>
      <DiscardButton draft={draft} busy={busy} act={act} />
    </div>
  );
}

function DiscardButton({
  draft,
  busy,
  act,
}: {
  draft: DraftView;
  busy: boolean;
  act: (a: Action, d: DraftView) => void;
}) {
  return (
    <button
      onClick={() => {
        if (window.confirm("Throw this one away, photo and all?")) act("discard", draft);
      }}
      disabled={busy}
      className="mt-3 w-full py-2 text-[0.9rem] text-ink-faint"
    >
      Discard
    </button>
  );
}

const BASES: { value: Basis; label: string }[] = [
  { value: "per_100g", label: "100g" },
  { value: "per_package", label: "Pack" },
  { value: "per_piece", label: "Piece" },
  { value: "per_serving", label: "Serving" },
];

function Chips<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className="rounded-[3px] border px-3 py-1.5 text-[0.9rem]"
          style={{
            borderColor: value === o.value ? "var(--hairline-strong)" : "var(--hairline)",
            color: value === o.value ? "var(--ink)" : "var(--ink-faint)",
            background: value === o.value ? "var(--ground-raised)" : "transparent",
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DraftForm({
  draft,
  reading: initial,
  busy,
  act,
}: {
  draft: DraftView;
  reading: Reading;
  busy: boolean;
  act: (a: Action, d: DraftView, extra?: Record<string, unknown>) => void;
}) {
  const [r, setR] = useState<Reading>(initial);
  const [aliases, setAliases] = useState(initial.aliases.join(", "));
  const set = <K extends keyof Reading>(key: K, value: Reading[K]) => setR((prev) => ({ ...prev, [key]: value }));

  // Where another model read the packet differently, show what it saw. That's
  // where a misread is most likely, so it's where to look hardest.
  const disputed = new Map<PrintedField, unknown>();
  for (const other of draft.otherReadings) {
    for (const f of differingFields(initial, other)) if (!disputed.has(f)) disputed.set(f, other[f]);
  }
  const hint = (f: PrintedField) => {
    if (!disputed.has(f)) return undefined;
    const v = disputed.get(f);
    return `Other reading: ${v === null || v === undefined || v === "" ? "none" : String(v)}`;
  };

  const full: Reading = { ...r, aliases: aliases.split(/[,、]/).map((a) => a.trim()).filter(Boolean) };
  const n = normalize(full);
  const off = n.per100 ? implausibility(n.per100) : null;
  const named = r.kind === "named_food";
  const perHundred = r.kind === "meat_fish_pack" || named;
  const estimate = r.estimate_per_100g ?? { kcal: 0, protein_g: 0, fat_g: 0, carbs_g: 0 };
  const setEstimate = (key: keyof typeof estimate, v: number | null) =>
    set("estimate_per_100g", { ...estimate, [key]: v ?? 0 });

  // The food-table row whose values are in use. Editing a value by hand
  // means it no longer is, and the food is honestly an estimate (§5.8).
  const [rowId, setRowId] = useState<number | null>(draft.reference?.id ?? null);
  // NumberFields hold their own text, so filling them from a row needs a remount.
  const [fill, setFill] = useState(0);
  const [allRows, setAllRows] = useState(false);
  const chosen = draft.candidates.find((c) => c.id === rowId) ?? null;
  const fromRow = !!chosen && !!r.estimate_per_100g && matchesRow(r.estimate_per_100g, chosen);
  function chooseRow(id: number | null) {
    setRowId(id);
    const row = draft.candidates.find((c) => c.id === id);
    set("estimate_per_100g", row ? row.per100 : (draft.modelEstimate ?? null));
    setFill((f) => f + 1);
  }
  const shownRows = allRows ? draft.candidates : draft.candidates.slice(0, 6);

  // A label is compared with its nearest generic row: wildly different
  // calories usually mean a misread the macros can't reveal.
  const gap = r.kind === "nutrition_label" && draft.reference && n.per100 ? crossCheckGap(n.per100, draft.reference) : null;

  return (
    <div className="pt-4">
      {named ? (
        <p className="text-[0.95rem] text-ink-dim">Added by name: &ldquo;{draft.requestedName}&rdquo;</p>
      ) : (
      <Chips
        value={r.kind}
        options={[
          { value: "nutrition_label", label: "Nutrition label" },
          { value: "meat_fish_pack", label: "Meat or fish pack" },
        ]}
        onChange={(v) => set("kind", v)}
      />
      )}
      {r.kind === "not_food" ? (
        <p className="pt-2 text-[0.9rem] text-ink-dim">This was read as not a food. Pick what it is, or discard it.</p>
      ) : null}

      <div className="grid gap-3 pt-4">
        <TextField label="Name" value={r.name} onChange={(v) => set("name", v)} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Japanese name" value={r.name_ja ?? ""} onChange={(v) => set("name_ja", v || null)} hint={hint("name_ja")} />
          <TextField label="Brand" value={r.brand ?? ""} onChange={(v) => set("brand", v || null)} hint={hint("brand")} />
        </div>
        {named ? null : (
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Net weight (g)" value={r.net_weight_g} onChange={(v) => set("net_weight_g", v)} hint={hint("net_weight_g")} />
          <NumberField label={`Pieces${r.piece_unit ? ` (${r.piece_unit})` : ""}`} value={r.piece_count} onChange={(v) => set("piece_count", v)} hint={hint("piece_count")} />
        </div>
        )}
      </div>

      {perHundred ? (
        <section className="pt-5">
          <p className="pb-1 text-[0.9rem] text-ink-dim">Per 100g, from the food table</p>
          {fromRow ? (
            <p className="pb-2 text-[0.95rem]">{chosen!.name}</p>
          ) : (
            <p className="pb-2 text-[0.95rem] text-ink-dim">
              {chosen ? "Edited by hand, so this is your own estimate." : "No row chosen: these are the model\u2019s estimate. Check them harder."}
            </p>
          )}
          {draft.candidates.length ? (
            <div className="flex flex-col gap-1.5 pb-3">
              {shownRows.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => chooseRow(c.id)}
                  className="rounded-[3px] border px-2.5 py-2 text-left text-[0.85rem] leading-snug"
                  style={{
                    borderColor: c.id === rowId && fromRow ? "var(--hairline-strong)" : "var(--hairline)",
                    color: c.id === rowId && fromRow ? "var(--ink)" : "var(--ink-dim)",
                    background: c.id === rowId && fromRow ? "var(--ground-raised)" : "transparent",
                  }}
                >
                  {c.name} <span className="text-ink-faint">· {c.per100.kcal} kcal</span>
                </button>
              ))}
              <div className="flex gap-4 pt-0.5 text-[0.85rem]">
                {draft.candidates.length > shownRows.length ? (
                  <button type="button" onClick={() => setAllRows(true)} className="text-ink-dim">
                    Show all {draft.candidates.length}
                  </button>
                ) : null}
                <button type="button" onClick={() => chooseRow(null)} className="text-ink-faint">
                  None of these
                </button>
              </div>
            </div>
          ) : null}
          <div key={fill} className="grid grid-cols-4 gap-2">
            <NumberField label="kcal" value={estimate.kcal} onChange={(v) => setEstimate("kcal", v)} />
            <NumberField label="Protein" value={estimate.protein_g} onChange={(v) => setEstimate("protein_g", v)} />
            <NumberField label="Fat" value={estimate.fat_g} onChange={(v) => setEstimate("fat_g", v)} />
            <NumberField label="Carbs" value={estimate.carbs_g} onChange={(v) => setEstimate("carbs_g", v)} />
          </div>
        </section>
      ) : (
        <section className="pt-5">
          <p className="pb-2 text-[0.9rem] text-ink-dim">The label&rsquo;s numbers are per</p>
          <Chips value={r.basis} options={BASES} onChange={(v) => set("basis", v)} />
          {hint("basis") ? <p className="pt-1 text-[0.8rem] text-ink-faint">{hint("basis")}</p> : null}
          {r.basis && r.basis !== "per_100g" ? (
            <div className="pt-3">
              <NumberField
                label={r.basis === "per_package" ? "Grams in that pack, if different from net weight" : "Grams that covers"}
                value={r.basis_grams}
                onChange={(v) => set("basis_grams", v)}
                hint={hint("basis_grams")}
              />
            </div>
          ) : null}
          <div className="grid grid-cols-4 gap-2 pt-3">
            <NumberField label="kcal" value={r.kcal} onChange={(v) => set("kcal", v)} hint={hint("kcal")} />
            <NumberField label="Protein" value={r.protein_g} onChange={(v) => set("protein_g", v)} hint={hint("protein_g")} />
            <NumberField label="Fat" value={r.fat_g} onChange={(v) => set("fat_g", v)} hint={hint("fat_g")} />
            <NumberField label="Carbs" value={r.carbs_g} onChange={(v) => set("carbs_g", v)} hint={hint("carbs_g")} />
          </div>
          <p className="pt-3 pb-2 text-[0.85rem] text-ink-faint">Or, when carbs are split</p>
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="糖質 sugars" value={r.sugar_g} onChange={(v) => set("sugar_g", v)} hint={hint("sugar_g")} />
            <NumberField label="食物繊維 fibre" value={r.fiber_g} onChange={(v) => set("fiber_g", v)} hint={hint("fiber_g")} />
          </div>
        </section>
      )}

      <section className="pt-5">
        <p className="pb-2 text-[0.9rem] text-ink-dim">Weighed</p>
        <Chips
          value={r.weight_basis}
          options={[
            { value: "raw", label: "Raw" },
            { value: "cooked", label: "Cooked" },
            { value: "as_packaged", label: "As packaged" },
          ]}
          onChange={(v) => set("weight_basis", v)}
        />
      </section>

      <div className="pt-4">
        <TextField label="Also called, for voice logging" value={aliases} onChange={setAliases} placeholder="senbei, rice crackers" />
      </div>

      {r.notes ? <p className="pt-3 text-[0.85rem] leading-relaxed text-ink-faint">Reader&rsquo;s note: {r.notes}</p> : null}

      <section className="mt-5 border-t border-hairline pt-4 text-[0.95rem] leading-relaxed">
        {n.per100 ? (
          <p>
            Per 100g: {fmt(n.per100.kcal, 0)} kcal · protein {fmt(n.per100.protein_g)}g · fat {fmt(n.per100.fat_g)}g ·
            carbs {fmt(n.per100.carbs_g)}g
          </p>
        ) : null}
        {n.servings.length ? (
          <p className="text-ink-dim">{n.servings.map((s) => `1 ${s.label} = ${fmt(s.grams)}g`).join(" · ")}</p>
        ) : null}
        {gap !== null && gap > CROSS_CHECK_TOLERANCE ? (
          <p className="pt-1 text-ink-dim">
            This reads very differently from typical {draft.reference!.name} ({draft.reference!.per100.kcal} kcal per
            100g). Check the numbers and what they&rsquo;re per.
          </p>
        ) : null}
        {off !== null && off > PLAUSIBILITY_TOLERANCE ? (
          <p className="pt-1 text-ink-dim">
            The calories are {Math.round(off * 100)}% off what the macros add up to. Worth a second look at the label.
          </p>
        ) : null}
        {n.problems.map((p) => (
          <p key={p} className="pt-1 text-ink-dim">
            {p}
          </p>
        ))}
      </section>

      <button
        onClick={() =>
          act("confirm", draft, {
            reading: full,
            reference: r.kind === "nutrition_label" ? (draft.reference?.id ?? null) : fromRow ? rowId : null,
          })
        }
        disabled={busy || n.problems.length > 0}
        className="mt-5 w-full rounded-[3px] border border-hairline-strong bg-ground-raised py-3.5 text-[1rem] text-ink disabled:text-ink-faint"
      >
        {busy ? "…" : "Confirm"}
      </button>

      {draft.matches.length ? (
        <div className="pt-3">
          <p className="pb-1.5 text-[0.85rem] text-ink-faint">Or is it one you already have?</p>
          {draft.matches.map((m) => (
            <button
              key={m.id}
              onClick={() => act("merge", draft, { into: m.id })}
              disabled={busy}
              className="mt-1.5 w-full rounded-[3px] border border-hairline py-2.5 text-[0.9rem] text-ink-dim"
            >
              Same as {m.name}
              {m.nameJa ? ` (${m.nameJa})` : ""}
            </button>
          ))}
        </div>
      ) : null}

      <DiscardButton draft={draft} busy={busy} act={act} />
    </div>
  );
}
