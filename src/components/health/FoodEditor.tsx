"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { FoodView } from "@/lib/health/foods";
import { implausibility, PLAUSIBILITY_TOLERANCE, type Serving, type WeightBasis } from "@/lib/health/reading";
import { PhotoViewer } from "./PhotoViewer";
import { NumberField, TextField } from "./fields";

let seq = 0;
type Row = Serving & { key: number };

/**
 * Fixing a confirmed food. Values here are per 100g, not as printed: the
 * label was checked at review, and this is for correcting the food itself.
 * Past log entries keep their own snapshot, so nothing logged changes.
 */
export function FoodEditor({ food }: { food: FoodView }) {
  const router = useRouter();
  const [name, setName] = useState(food.name);
  const [nameJa, setNameJa] = useState(food.nameJa ?? "");
  const [brand, setBrand] = useState(food.brand ?? "");
  const [aliases, setAliases] = useState(food.aliases.join(", "));
  const [basis, setBasis] = useState<WeightBasis>(food.weightBasis);
  const [kcal, setKcal] = useState<number | null>(food.per100.kcal);
  const [protein, setProtein] = useState<number | null>(food.per100.protein_g);
  const [fat, setFat] = useState<number | null>(food.per100.fat_g);
  const [carbs, setCarbs] = useState<number | null>(food.per100.carbs_g);
  const [defaultGrams, setDefaultGrams] = useState<number | null>(food.defaultGrams);
  const [servings, setServings] = useState<Row[]>(food.servings.map((s) => ({ ...s, key: seq++ })));
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const off =
    kcal !== null && protein !== null && fat !== null && carbs !== null
      ? implausibility({ kcal, protein_g: protein, fat_g: fat, carbs_g: carbs })
      : null;

  async function save() {
    if (kcal === null || protein === null || fat === null || carbs === null) {
      setMessage("Calories, protein, fat and carbs are all needed.");
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/foods/${food.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          name_ja: nameJa || null,
          brand: brand || null,
          aliases: aliases.split(/[,、]/).map((a) => a.trim()).filter(Boolean),
          weight_basis: basis,
          kcal,
          protein_g: protein,
          fat_g: fat,
          carbs_g: carbs,
          default_grams: defaultGrams,
          servings: servings.filter((s) => s.label.trim() && s.grams > 0).map(({ label, grams }) => ({ label, grams })),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Couldn't save");
      setMessage("Saved.");
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete ${food.name} from the library?`)) return;
    setBusy(true);
    const res = await fetch(`/api/foods/${food.id}`, { method: "DELETE" });
    if (res.ok) {
      router.replace("/library");
      router.refresh();
    } else {
      setBusy(false);
      setMessage("Couldn't delete it.");
    }
  }

  const chip = (value: WeightBasis, label: string) => (
    <button
      key={value}
      type="button"
      onClick={() => setBasis(value)}
      className="rounded-[10px] border px-3 py-1.5 text-[0.9rem]"
      style={{
        borderColor: basis === value ? "var(--hairline-strong)" : "var(--hairline)",
        color: basis === value ? "var(--ink)" : "var(--ink-faint)",
        background: basis === value ? "var(--ground-raised)" : "transparent",
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="px-5 pt-3 pb-6">
      <Link href="/library" className="text-[0.9rem] text-ink-dim">
        ← Fridge
      </Link>
      {food.images.length ? <PhotoViewer images={food.images} /> : null}

      <div className="grid gap-3 pt-4">
        <TextField label="Name" value={name} onChange={setName} />
        <div className="grid grid-cols-2 gap-3">
          <TextField label="Japanese name" value={nameJa} onChange={setNameJa} />
          <TextField label="Brand" value={brand} onChange={setBrand} />
        </div>
        <TextField label="Also called" value={aliases} onChange={setAliases} />
      </div>

      <p className="pt-5 pb-2 text-[0.9rem] text-ink-dim">Per 100g</p>
      <div className="grid grid-cols-4 gap-2">
        <NumberField label="kcal" value={kcal} onChange={setKcal} />
        <NumberField label="Protein" value={protein} onChange={setProtein} />
        <NumberField label="Fat" value={fat} onChange={setFat} />
        <NumberField label="Carbs" value={carbs} onChange={setCarbs} />
      </div>
      {off !== null && off > PLAUSIBILITY_TOLERANCE ? (
        <p className="pt-2 text-[0.9rem] text-ink-dim">
          The calories are {Math.round(off * 100)}% off what the macros add up to.
        </p>
      ) : null}

      <p className="pt-5 pb-2 text-[0.9rem] text-ink-dim">Weighed</p>
      <div className="flex flex-wrap gap-1.5">
        {chip("raw", "Raw")}
        {chip("cooked", "Cooked")}
        {chip("as_packaged", "As packaged")}
      </div>

      <p className="pt-5 pb-2 text-[0.9rem] text-ink-dim">Servings</p>
      <div className="grid gap-2">
        {servings.map((s, i) => (
          <div key={s.key} className="flex items-end gap-2">
            <div className="flex-1">
              <TextField
                label="Name"
                value={s.label}
                onChange={(v) => setServings(servings.map((x, j) => (j === i ? { ...x, label: v } : x)))}
              />
            </div>
            <div className="w-28">
              <NumberField
                label="Grams"
                value={s.grams}
                onChange={(v) => setServings(servings.map((x, j) => (j === i ? { ...x, grams: v ?? 0 } : x)))}
              />
            </div>
            <button
              onClick={() => setServings(servings.filter((_, j) => j !== i))}
              className="px-1.5 pb-2 text-[0.85rem] text-ink-faint"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <button
        onClick={() => setServings([...servings, { label: "", grams: 0, key: seq++ }])}
        className="pt-2 text-[0.9rem] text-ink-dim"
      >
        Add a serving
      </button>

      <div className="pt-4">
        <NumberField label="Grams to start from when logging" value={defaultGrams} onChange={setDefaultGrams} />
      </div>

      <button
        onClick={save}
        disabled={busy}
        className="mt-6 w-full rounded-[10px] border border-hairline-strong bg-ground-raised py-3.5 text-[1rem] text-ink disabled:text-ink-faint"
      >
        {busy ? "…" : "Save"}
      </button>
      {message ? <p className="pt-3 text-center text-[0.9rem] text-ink-dim">{message}</p> : null}
      <button onClick={remove} disabled={busy} className="mt-3 w-full py-2 text-[0.9rem] text-ink-faint">
        Delete from library
      </button>
    </div>
  );
}
