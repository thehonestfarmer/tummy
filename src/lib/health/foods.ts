import "server-only";
import { z } from "zod";
import { sql } from "../db";
import { bothUsers, type User } from "../auth";
import { deleteFoodPhoto } from "./photos";
import type { Client } from "./client";
import { PAIR_ORDER } from "../config";
import {
  normalize,
  type Macros,
  type Reading,
  type Serving,
  type WeightBasis,
} from "./reading";
import { readFoodPhotos, ReviewedReadingSchema, visionModels } from "./vision";
import { interpretName } from "./named";
import { textModel } from "./claude";
import { flushPendingLogs } from "./entries";
import { matchesRow, pickReference, referenceRows, searchReference, type ReferenceRow } from "./reference";

/**
 * The shared food library (healthspec.md §5.1–5.3).
 *
 * A photo becomes a **draft**. It is read in the background, by every
 * configured vision model while a comparison is running. Someone confirms it
 * against the photo, and only then is it a food the logger will count. A
 * confirmed food is never re-read; fixing one means editing it.
 */

/** Long enough for two models to read two photos; past it a draft is presumed lost. */
const READING_TIMEOUT_MS = 4 * 60 * 1000;

export type DraftState = "reading" | "failed" | "ready";

export type DraftView = {
  id: number;
  images: string[];
  addedBy: string | null;
  /** Where it was submitted from: the app, or read in a chat. */
  client: Client;
  state: DraftState;
  /** Read and showable, but its food-table cross-check hasn't come back yet. */
  checking: boolean;
  error: string | null;
  /** What the review screen pre-fills from. */
  reading: Reading | null;
  /**
   * The other models' readings, unlabelled. The reviewer sees where they
   * disagree, which is exactly where a misread is most likely, but not whose
   * reading is whose, so the comparison isn't tilted either way.
   */
  otherReadings: Reading[];
  /** Confirmed foods this might already be. */
  matches: { id: number; name: string; nameJa: string | null }[];
  /** For a food added by name: what was asked for. */
  requestedName: string | null;
  /**
   * The reference-table row the matcher chose (§5.8). For a pack or a named
   * food its values pre-fill the form; for a label it is only a cross-check.
   */
  reference: ReferenceRow | null;
  /** Every row the search found, best first, so the reviewer can pick another. */
  candidates: ReferenceRow[];
  /** The model's own per-100g estimate, for when no row fits. */
  modelEstimate: Macros | null;
};

export type ReviewView = { drafts: DraftView[]; reading: number; libraryCount: number };

export type FoodView = {
  id: number;
  name: string;
  nameJa: string | null;
  brand: string | null;
  aliases: string[];
  per100: Macros;
  weightBasis: WeightBasis;
  defaultGrams: number | null;
  servings: Serving[];
  source: string;
  images: string[];
  /** The reference-table row the values came from, or a label was checked against. */
  reference: { foodNumber: string; name: string } | null;
};

export type LibraryView = { foods: FoodView[]; drafts: number };

type FoodRow = {
  id: number;
  name: string | null;
  name_ja: string | null;
  brand: string | null;
  aliases: string[];
  kcal: number | null;
  protein_g: number | null;
  fat_g: number | null;
  carbs_g: number | null;
  weight_basis: WeightBasis;
  default_grams: number | null;
  source: string | null;
  status: "draft" | "confirmed";
  image_url: string | null;
  image2_url: string | null;
  created_by: number | null;
  created_at: Date;
  requested_name: string | null;
  client: Client;
  reference_food_id: number | null;
  reference_candidates: number[];
  /** False while a reading is still waiting on its food-table row. */
  reference_done: boolean;
};

type ReadingRow = {
  food_id: number;
  is_primary: boolean;
  output: Reading | null;
  error: string | null;
};

const images = (r: Pick<FoodRow, "image_url" | "image2_url">) =>
  [r.image_url, r.image2_url].filter((u): u is string => !!u);

/* ─── Drafts ─────────────────────────────────────────────────────────────── */

/** A food asked for in words, with no photo: "squid, raw" (§5.2, item 3). */
export async function createNamedDraft(user: User, text: string, client: Client = "pwa"): Promise<number> {
  const name = text.trim();
  if (!name) throw new Error("Say which food.");
  if (name.length > 120) throw new Error("That's longer than a food name.");
  const [{ id }] = await sql<{ id: number }[]>`
    insert into foods (requested_name, client, created_by, reference_done)
    values (${name}, ${client}, ${user.id}, false) returning id`;
  return id;
}

export async function createDraft(user: User, imageUrls: string[]): Promise<number> {
  const [front, back] = imageUrls;
  const [{ id }] = await sql<{ id: number }[]>`
    insert into foods (image_url, image2_url, created_by, reference_done)
    values (${front}, ${back ?? null}, ${user.id}, false)
    returning id`;
  return id;
}

export const describe = (r: Reading) =>
  [
    r.name,
    r.name_ja ? `(${r.name_ja})` : "",
    r.kind === "meat_fish_pack" ? "— a supermarket meat or fish pack" : "",
    r.weight_basis === "cooked" ? "— cooked" : "",
    r.notes ? `— ${r.notes}` : "",
  ]
    .filter(Boolean)
    .join(" ");

/**
 * Reads a draft and records what each model said. A photo draft goes to
 * every configured vision model; a named one is interpreted once. The
 * reading that will pre-fill the review is then matched against the
 * reference table (§5.8) before anything is written, so a draft only shows
 * up as ready once it is complete.
 *
 * Called from `after()`, so it must never throw: a failure is a row, which
 * the review screen shows with a retry.
 *
 * With two models, which one pre-fills alternates by draft. Always
 * pre-filling the same one would mean the reviewer only ever corrects that
 * model, and the other's errors would go unseen wherever they agreed.
 */
export async function readDraft(foodId: number): Promise<void> {
  try {
    const rows = await sql<FoodRow[]>`
      select * from foods where id = ${foodId} and status = 'draft'`;
    const food = rows[0];
    if (!food) return;

    const named = food.requested_name;
    const models = named ? [textModel()] : visionModels();
    const primary = models.length > 1 ? foodId % models.length : 0;
    const urls = images(food);

    // A retry may have started while an earlier read was in flight; this one starts clean.
    await sql`delete from food_readings where food_id = ${foodId}`;

    /*
     * Each reading is written the moment it lands, so someone scanning a
     * label sees its values after one model's time, not after both models
     * and the food-table match. The match starts as soon as the lead reading
     * is in, without waiting for the comparison reading, and
     * `reference_done` says when it has come back.
     */
    const reads = models.map(async (model, i) => {
      try {
        const { reading, servedBy, latencyMs } = await (named ? interpretName(named) : readFoodPhotos(model, urls));
        await sql`
          insert into food_readings (food_id, model, served_by, is_primary, output, latency_ms)
          values (${foodId}, ${model}, ${servedBy}, ${i === primary}, ${sql.json(reading as never)}, ${latencyMs})`;
        return reading;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Reading failed";
        await sql`
          insert into food_readings (food_id, model, is_primary, error)
          values (${foodId}, ${model}, ${i === primary}, ${message.slice(0, 500)})`;
        return null;
      }
    });

    // The lead is the primary's reading; only if that failed is it worth waiting for another.
    const lead = (await reads[primary]) ?? (await Promise.all(reads)).find(Boolean) ?? null;
    let candidates: ReferenceRow[] = [];
    let reference: ReferenceRow | null = null;
    if (lead && lead.kind !== "not_food") {
      candidates = await searchReference(lead.reference_terms);
      reference = await pickReference(
        describe(lead),
        candidates,
        lead.kind === "nutrition_label" ? "cross_check" : "values",
      );
    }
    await sql`
      update foods set reference_food_id = ${reference?.id ?? null},
                       reference_candidates = ${candidates.map((c) => c.id)},
                       reference_done = true
      where id = ${foodId}`;
    // The comparison reading only has to be recorded; nobody is waiting on it.
    await Promise.all(reads);
  } catch (err) {
    console.error(`[tummy] reading food ${foodId} failed`, err);
  } finally {
    // Whatever happened, nobody is left waiting on a match that isn't coming.
    await sql`update foods set reference_done = true where id = ${foodId}`.catch(() => {});
  }
}

/**
 * Reads again any recent draft that never got a reading: one a deploy or a
 * restart cut off mid-read (healthspec.md §3). Called once at boot, one draft
 * at a time so a restart after a big batch doesn't fire every read at once.
 * Older drafts are left for the review screen's retry.
 */
export async function resumeUnreadDrafts(): Promise<number> {
  const rows = await sql<{ id: number }[]>`
    select f.id from foods f
    where f.status = 'draft' and f.created_at > now() - interval '1 day'
      and not exists (select 1 from food_readings r where r.food_id = f.id)
    order by f.id`;
  for (const { id } of rows) {
    await resetDraft(id);
    await readDraft(id);
  }
  return rows.length;
}

/** Clears what the models said, so the draft reads again from scratch. */
export async function resetDraft(foodId: number) {
  const rows = await sql<{ id: number }[]>`
    select id from foods where id = ${foodId} and status = 'draft'`;
  if (!rows.length) throw new Error("That draft is no longer waiting.");
  await sql`delete from food_readings where food_id = ${foodId}`;
  // Restart the clock, so the fresh attempt isn't immediately reported as timed out.
  await sql`update foods set created_at = now(), updated_at = now(), reference_done = false where id = ${foodId}`;
}

const keyOf = (s: string | null | undefined) =>
  (s ?? "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");

export type Candidate = { id: number; name: string; nameJa: string | null; keys: string[] };

/**
 * Likely duplicates, so the kitchen doesn't end up with five chicken breasts
 * (§5.2). Deliberately loose: a false match costs the reviewer a glance, a
 * missed one costs a duplicate food that splits the history.
 */
export function likelyMatches(reading: Reading | null, library: Candidate[]) {
  if (!reading) return [];
  const mine = [reading.name, reading.name_ja, ...reading.aliases].map(keyOf).filter((k) => k.length >= 2);
  if (!mine.length) return [];
  return library
    .filter((food) => food.keys.some((k) => mine.some((m) => k === m || k.includes(m) || m.includes(k))))
    .slice(0, 3)
    .map(({ id, name, nameJa }) => ({ id, name, nameJa }));
}

/** The confirmed library, keyed for duplicate matching. */
export async function duplicateCandidates(): Promise<Candidate[]> {
  const library = await sql<{ id: number; name: string; name_ja: string | null; aliases: string[] }[]>`
    select id, name, name_ja, aliases from foods where status = 'confirmed'`;
  return library.map((f) => ({
    id: f.id,
    name: f.name,
    nameJa: f.name_ja,
    keys: [f.name, f.name_ja, ...f.aliases].map(keyOf).filter((k) => k.length >= 2),
  }));
}

export async function getReviewQueue(now: Date = new Date()): Promise<ReviewView> {
  const [users, drafts, readings, library] = await Promise.all([
    bothUsers(),
    sql<FoodRow[]>`select * from foods where status = 'draft' order by created_at asc, id asc`,
    sql<ReadingRow[]>`
      select r.food_id, r.is_primary, r.output, r.error
      from food_readings r join foods f on f.id = r.food_id
      where f.status = 'draft'
      order by r.is_primary desc, r.id asc`,
    sql<{ id: number; name: string; name_ja: string | null; aliases: string[] }[]>`
      select id, name, name_ja, aliases from foods where status = 'confirmed'`,
  ]);

  const nameOf = new Map(PAIR_ORDER.map((s) => [users[s].id, users[s].displayName]));
  const refs = new Map(
    (await referenceRows([...new Set(drafts.flatMap((d) => d.reference_candidates))])).map((r) => [r.id, r]),
  );
  const candidates: Candidate[] = library.map((f) => ({
    id: f.id,
    name: f.name,
    nameJa: f.name_ja,
    keys: [f.name, f.name_ja, ...f.aliases].map(keyOf).filter((k) => k.length >= 2),
  }));

  const views = drafts.map((food): DraftView => {
    const mine = readings.filter((r) => r.food_id === food.id);
    const primary = mine.find((r) => r.is_primary);
    const succeeded = mine.filter((r) => r.output);
    // A failed primary with a successful second reading is still reviewable.
    const read = primary?.output ?? succeeded[0]?.output ?? null;
    const otherReadings = succeeded.map((r) => r.output!).filter((o) => o !== read);
    const reference = food.reference_food_id === null ? null : (refs.get(food.reference_food_id) ?? null);
    // A pack or named food takes its values from the chosen row, not the model's estimate.
    const reading =
      read && reference && read.kind !== "nutrition_label"
        ? { ...read, estimate_per_100g: reference.per100 }
        : read;

    let state: DraftState = "ready";
    let error: string | null = null;
    const stale = now.getTime() - food.created_at.getTime() > READING_TIMEOUT_MS;
    // A read still in flight: more readings, or the food-table row, are on their way.
    const waiting = !food.reference_done && !stale;
    if (!mine.length) {
      state = stale ? "failed" : "reading";
      error = stale ? "Reading timed out." : null;
    } else if (waiting && (!primary || !reading || reading.kind !== "nutrition_label")) {
      // Not showable yet: the lead reading hasn't landed, or this is a pack or
      // a named food, whose values are the row's and would change under the reader.
      state = "reading";
    } else if (!reading) {
      state = "failed";
      error = primary?.error ?? mine[0].error;
    }

    return {
      id: food.id,
      images: images(food),
      addedBy: food.created_by === null ? null : (nameOf.get(food.created_by) ?? null),
      client: food.client,
      state,
      checking: waiting && state === "ready",
      error,
      reading,
      otherReadings,
      matches: likelyMatches(reading, candidates),
      requestedName: food.requested_name,
      reference,
      candidates: food.reference_candidates.map((id) => refs.get(id)).filter((r): r is ReferenceRow => !!r),
      modelEstimate: read?.estimate_per_100g ?? null,
    };
  });

  return {
    drafts: views,
    reading: views.filter((d) => d.state === "reading").length,
    libraryCount: library.length,
  };
}

const uniqueAliases = (values: (string | null | undefined)[], except: (string | null)[]) => {
  const skip = new Set(except.map(keyOf));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of values) {
    const trimmed = v?.trim();
    const key = keyOf(trimmed);
    if (!trimmed || !key || skip.has(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
  }
  return out;
};

/**
 * Turns a reviewed reading into a food. The reading is re-validated and
 * re-normalised here rather than trusting what the browser computed, and is
 * stored as the ground truth the models are scored against.
 */
export async function confirmDraft(
  me: User,
  foodId: number,
  raw: unknown,
  referenceId: number | null,
  via: Client,
): Promise<void> {
  const parsed = ReviewedReadingSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Some of those values aren't valid numbers.");
  const reading = parsed.data;
  const n = normalize(reading);
  if (n.problems.length) throw new Error(n.problems[0]);
  const per100 = n.per100!;

  /*
   * A pack or named food may say its values came from the table only if they
   * are exactly the row's. Edited by hand, they are the reviewer's own, so
   * the row is dropped and a named food is honestly an estimate. A label
   * keeps whatever row it was checked against.
   */
  const [row] = referenceId === null ? [] : await referenceRows([referenceId]);
  let source: string = n.source;
  let refId: number | null = row?.id ?? null;
  if (reading.kind !== "nutrition_label") {
    const fromRow = !!row && matchesRow(per100, row);
    refId = fromRow ? row.id : null;
    if (reading.kind === "named_food") source = fromRow ? "reference_table" : "llm_estimate";
  }

  let photos: string[] = [];
  await sql.begin(async (tx) => {
    const rows = await tx<FoodRow[]>`
      select * from foods where id = ${foodId} for update`;
    if (rows[0]?.status !== "draft") {
      throw new Error("Someone already dealt with that one.");
    }
    photos = images(rows[0]);
    const name = reading.name.trim();
    const nameJa = reading.name_ja?.trim() || null;
    const aliases = uniqueAliases(reading.aliases, [name, nameJa]);

    await tx`
      update foods set
        name = ${name}, name_ja = ${nameJa}, brand = ${reading.brand?.trim() || null},
        aliases = ${aliases},
        kcal = ${per100.kcal}, protein_g = ${per100.protein_g}, fat_g = ${per100.fat_g}, carbs_g = ${per100.carbs_g},
        weight_basis = ${reading.weight_basis}, default_grams = ${n.defaultGrams},
        source = ${source}, reference_food_id = ${refId},
        status = 'confirmed', reading = ${tx.json(reading as never)},
        image_url = null, image2_url = null,
        confirmed_by = ${me.id}, confirmed_via = ${via}, confirmed_at = now(), updated_at = now()
      where id = ${foodId}`;
    for (const s of n.servings) {
      await tx`insert into food_servings (food_id, label, grams) values (${foodId}, ${s.label}, ${s.grams})`;
    }
    // Anything said about this food while it was still a draft is logged now.
    await flushPendingLogs(foodId, tx);
  });
  // Reviewed, so the photo has done its job (healthspec.md §5.3). The reading
  // as printed stays as the record of what the packet said.
  await Promise.allSettled(photos.map(deleteFoodPhoto));
}

/**
 * Removes a draft and its photos. Rows first: an orphaned file is harmless
 * litter, and cron prunes it, whereas a row pointing at deleted bytes renders
 * as a broken frame.
 */
export async function discardDraft(foodId: number): Promise<void> {
  const rows = await sql<{ image_url: string | null; image2_url: string | null }[]>`
    delete from foods where id = ${foodId} and status = 'draft' returning image_url, image2_url`;
  await Promise.allSettled(rows.flatMap(images).map(deleteFoodPhoto));
}

/**
 * "This is the same as one we already have." The draft's names are kept as
 * aliases of the existing food, since they are exactly the words someone just
 * used for it, and the draft itself goes.
 */
export async function mergeDraft(foodId: number, intoId: number): Promise<void> {
  const [draft] = await sql<FoodRow[]>`select * from foods where id = ${foodId} and status = 'draft'`;
  if (!draft) throw new Error("That draft is no longer waiting.");
  const [target] = await sql<FoodRow[]>`select * from foods where id = ${intoId} and status = 'confirmed'`;
  if (!target) throw new Error("That food is no longer in the library.");

  const [primary] = await sql<{ output: Reading | null }[]>`
    select output from food_readings where food_id = ${foodId} and output is not null
    order by is_primary desc limit 1`;
  const r = primary?.output;
  const aliases = uniqueAliases(
    [...target.aliases, r?.name, r?.name_ja, ...(r?.aliases ?? [])],
    [target.name, target.name_ja],
  );
  await sql`update foods set aliases = ${aliases}, updated_at = now() where id = ${intoId}`;
  await discardDraft(foodId);
}

/* ─── The library ────────────────────────────────────────────────────────── */

type LibraryRow = FoodRow & { ref_number: string | null; ref_name: string | null };

function toView(row: LibraryRow, servings: Serving[]): FoodView {
  return {
    id: row.id,
    name: row.name ?? "",
    nameJa: row.name_ja,
    brand: row.brand,
    aliases: row.aliases,
    per100: {
      kcal: row.kcal ?? 0,
      protein_g: row.protein_g ?? 0,
      fat_g: row.fat_g ?? 0,
      carbs_g: row.carbs_g ?? 0,
    },
    weightBasis: row.weight_basis,
    defaultGrams: row.default_grams,
    servings,
    source: row.source ?? "",
    images: images(row),
    reference: row.ref_number ? { foodNumber: row.ref_number, name: row.ref_name! } : null,
  };
}

async function servingsFor(ids: number[]) {
  if (!ids.length) return new Map<number, Serving[]>();
  const rows = await sql<{ food_id: number; label: string; grams: number }[]>`
    select food_id, label, grams from food_servings where food_id = any(${ids}) order by grams asc`;
  const out = new Map<number, Serving[]>();
  for (const r of rows) out.set(r.food_id, [...(out.get(r.food_id) ?? []), { label: r.label, grams: r.grams }]);
  return out;
}

export async function getLibrary(): Promise<LibraryView> {
  const [foods, [{ count }]] = await Promise.all([
    sql<LibraryRow[]>`
      select f.*, r.food_number as ref_number, r.name as ref_name
      from foods f left join reference_foods r on r.id = f.reference_food_id
      where f.status = 'confirmed' order by lower(f.name) asc`,
    sql<{ count: string }[]>`select count(*) from foods where status = 'draft'`,
  ]);
  const servings = await servingsFor(foods.map((f) => f.id));
  return { foods: foods.map((f) => toView(f, servings.get(f.id) ?? [])), drafts: Number(count) };
}

export async function getFood(foodId: number): Promise<FoodView | null> {
  const [row] = await sql<LibraryRow[]>`
    select f.*, r.food_number as ref_number, r.name as ref_name
    from foods f left join reference_foods r on r.id = f.reference_food_id
    where f.id = ${foodId} and f.status = 'confirmed'`;
  if (!row) return null;
  return toView(row, (await servingsFor([row.id])).get(row.id) ?? []);
}

const grams = z.number().positive().max(100_000);
const macro = z.number().min(0).max(10_000);

export const FoodPatchSchema = z.object({
  name: z.string().trim().min(1).max(120),
  name_ja: z.string().trim().max(120).nullable(),
  brand: z.string().trim().max(120).nullable(),
  aliases: z.array(z.string().trim().min(1).max(120)).max(40),
  weight_basis: z.enum(["raw", "cooked", "as_packaged"]),
  kcal: macro,
  protein_g: macro,
  fat_g: macro,
  carbs_g: macro,
  default_grams: grams.nullable(),
  servings: z.array(z.object({ label: z.string().trim().min(1).max(40), grams })).max(12),
});

/**
 * Edits a confirmed food in place. Past log entries carry their own
 * snapshot (§5.4), so this corrects what happens next, not history.
 */
export async function updateFood(foodId: number, raw: unknown): Promise<FoodView> {
  const parsed = FoodPatchSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Some of those values aren't valid.");
  const p = parsed.data;
  const labels = new Set(p.servings.map((s) => s.label.toLowerCase()));
  if (labels.size !== p.servings.length) throw new Error("Two servings share a name.");

  await sql.begin(async (tx) => {
    const updated = await tx`
      update foods set
        name = ${p.name}, name_ja = ${p.name_ja || null}, brand = ${p.brand || null},
        aliases = ${uniqueAliases(p.aliases, [p.name, p.name_ja])}, weight_basis = ${p.weight_basis},
        kcal = ${p.kcal}, protein_g = ${p.protein_g}, fat_g = ${p.fat_g}, carbs_g = ${p.carbs_g},
        default_grams = ${p.default_grams}, updated_at = now()
      where id = ${foodId} and status = 'confirmed'
      returning id`;
    if (!updated.length) throw new Error("That food is no longer in the library.");
    await tx`delete from food_servings where food_id = ${foodId}`;
    for (const s of p.servings) {
      await tx`insert into food_servings (food_id, label, grams) values (${foodId}, ${s.label}, ${s.grams})`;
    }
  });
  return (await getFood(foodId))!;
}

export async function deleteFood(foodId: number): Promise<void> {
  const rows = await sql<{ image_url: string | null; image2_url: string | null }[]>`
    delete from foods where id = ${foodId} returning image_url, image2_url`;
  await Promise.allSettled(rows.flatMap(images).map(deleteFoodPhoto));
}

export const ManualFoodSchema = z.object({
  name: z.string().trim().min(1).max(120),
  name_ja: z.string().trim().max(120).nullable().optional(),
  kcal: macro,
  protein_g: macro,
  fat_g: macro,
  carbs_g: macro,
  weight_basis: z.enum(["raw", "cooked", "as_packaged"]).default("raw"),
  default_grams: grams.nullable().optional(),
});

/**
 * Typed-in numbers (§5.2, item 4). The person typing them is the check, so
 * the food is confirmed straight away rather than queued for review.
 */
export async function createManualFood(me: User, raw: unknown, client: Client = "pwa"): Promise<number> {
  const parsed = ManualFoodSchema.safeParse(raw);
  if (!parsed.success) throw new Error("Needs a name and per-100g calories, protein, fat and carbs.");
  const p = parsed.data;
  const [{ id }] = await sql<{ id: number }[]>`
    insert into foods (name, name_ja, kcal, protein_g, fat_g, carbs_g, weight_basis, default_grams,
                       source, client, status, created_by, confirmed_by, confirmed_via, confirmed_at)
    values (${p.name}, ${p.name_ja || null}, ${p.kcal}, ${p.protein_g}, ${p.fat_g}, ${p.carbs_g},
            ${p.weight_basis}, ${p.default_grams ?? 100}, 'manual', ${client}, 'confirmed', ${me.id}, ${me.id},
            ${client}, now())
    returning id`;
  return id;
}

/** Confirmed foods whose name, Japanese name or any alias contains the query. */
export async function searchFoods(query: string): Promise<FoodView[]> {
  const { foods } = await getLibrary();
  const q = query.normalize("NFKC").toLowerCase().trim();
  if (!q) return foods;
  return foods.filter((f) =>
    [f.name, f.nameJa, f.brand, ...f.aliases].some((s) => (s ?? "").normalize("NFKC").toLowerCase().includes(q)),
  );
}
