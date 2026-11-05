import "server-only";
import { sql } from "../db";
import type { User } from "../auth";
import type { Client } from "./client";
import {
  confirmDraft,
  describe,
  duplicateCandidates,
  getFood,
  getReviewQueue,
  likelyMatches,
  type FoodView,
} from "./foods";
import { corrected, toReading, type Correction, type Printed } from "./printed";
import {
  CROSS_CHECK_TOLERANCE,
  implausibility,
  normalize,
  PLAUSIBILITY_TOLERANCE,
  type Macros,
  type Reading,
  type Serving,
} from "./reading";
import { crossCheckGap, pickReference, searchReference, type ReferenceRow } from "./reference";

/**
 * Foods from a chat (mcpspec.md §4.1, §8). Claude or ChatGPT reads a photo
 * itself and submits the label as printed; the server derives everything
 * else and runs the same checks the review screen does.
 *
 * The confirmation rule is the app's: a food counts only once a person has
 * seen its values and said yes. In a chat the server can't see that happen,
 * so `confirmed: true` is honoured only when the values the person saw are
 * the values that will be saved. Whenever the server has something new to
 * show, it keeps a draft and hands the values back to be shown first:
 *
 *   - a warning (calories that don't fit the macros, a label far from its
 *     generic row, an estimate with no table row behind it);
 *   - an estimate whose values the server replaced with a table row's.
 *
 * The assistant then shows them and calls `confirm_food`.
 */

/** A chat's reading is filed under its client, apart from the vision models it isn't. */
const chatModel = (client: Client) => `chat:${client}`;

export type ChatFood = {
  status: "confirmed" | "draft" | "possible_duplicate";
  draft_id?: number;
  food_id?: number;
  name: string;
  per_100g?: Macros;
  servings?: Serving[];
  /** The food-table row the values came from, or a label was checked against. */
  table_row?: string;
  warnings?: string[];
  possible_duplicates?: { food_id: number; name: string; name_ja: string | null }[];
  message: string;
};

function warningsFor(reading: Reading, per100: Macros, reference: ReferenceRow | null): string[] {
  const out: string[] = [];
  const off = implausibility(per100);
  if (off !== null && off > PLAUSIBILITY_TOLERANCE) {
    out.push(
      `Calories don't fit the macros (${Math.round(off * 100)}% off protein×4 + carbs×4 + fat×9). ` +
        "Check the numbers against the label.",
    );
  }
  if (reading.kind === "nutrition_label" && reference) {
    const gap = crossCheckGap(per100, reference);
    if (gap !== null && gap > CROSS_CHECK_TOLERANCE) {
      out.push(
        `This reads very differently from typical ${reference.name} (${reference.per100.kcal} kcal per 100g). ` +
          "Check the numbers, and that the basis is right.",
      );
    }
  }
  if (reading.kind !== "nutrition_label" && !reference) {
    out.push("No food-table row fits, so these are an estimate. Check them harder.");
  }
  return out;
}

/** Submits one food. Never throws for a bad item: the reason comes back in words. */
export async function submitFromChat(
  me: User,
  client: Client,
  printed: Printed,
  opts: { confirmed: boolean; newFood: boolean },
): Promise<ChatFood> {
  let reading = toReading(printed);

  if (!opts.newFood) {
    const dupes = likelyMatches(reading, await duplicateCandidates());
    if (dupes.length) {
      return {
        status: "possible_duplicate",
        name: reading.name,
        possible_duplicates: dupes.map((d) => ({ food_id: d.id, name: d.name, name_ja: d.nameJa })),
        message:
          `The library may already have this. Ask whether it's one of these; if not, submit again with ` +
          "new_food: true.",
      };
    }
  }

  const candidates = await searchReference(reading.reference_terms);
  const label = reading.kind === "nutrition_label";
  const reference = await pickReference(describe(reading), candidates, label ? "cross_check" : "values");
  // An estimate takes the row's values when one fits (healthspec.md §5.8).
  const submitted = reading;
  if (!label && reference) reading = { ...reading, estimate_per_100g: reference.per100 };

  const n = normalize(reading);
  if (n.problems.length) throw new Error(`${reading.name}: ${n.problems[0]}`);
  const per100 = n.per100!;
  const warnings = warningsFor(reading, per100, reference);
  const replaced = reading !== submitted;

  const id = await sql.begin(async (tx) => {
    const [{ id }] = await tx<{ id: number }[]>`
      insert into foods (requested_name, client, created_by, reference_food_id, reference_candidates)
      values (${reading.name}, ${client}, ${me.id}, ${reference?.id ?? null}, ${candidates.map((c) => c.id)})
      returning id`;
    // What the chat submitted, kept as its reading: the original that any correction is measured from.
    await tx`
      insert into food_readings (food_id, model, served_by, is_primary, output)
      values (${id}, ${chatModel(client)}, ${chatModel(client)}, true, ${tx.json(submitted as never)})`;
    return id;
  });

  const shown = {
    name: reading.name,
    per_100g: per100,
    servings: n.servings,
    ...(reference ? { table_row: reference.name } : {}),
    ...(warnings.length ? { warnings } : {}),
  };

  if (opts.confirmed && !warnings.length && !replaced) {
    await confirmDraft(me, id, reading, reference?.id ?? null, client);
    return { status: "confirmed", food_id: id, ...shown, message: `Saved ${reading.name} to the library.` };
  }
  return {
    status: "draft",
    draft_id: id,
    ...shown,
    message: replaced
      ? `Tummy took the values from the food table (${reference!.name}). Show them to the person; on yes, call ` +
        "confirm_food."
      : warnings.length
        ? "Not saved yet. Show the person these values and the warnings; on yes, call confirm_food."
        : "Waiting for a yes. Show the person these values, then call confirm_food. It's also in the app's Review " +
          "screen.",
  };
}

export type ChatDraft = {
  draft_id: number;
  name: string;
  state: string;
  read_in: Client;
  per_100g: Macros | null;
  servings: Serving[];
  table_row?: string;
  warnings: string[];
  problems: string[];
};

/** Drafts as a chat should see them: the values a person would be saying yes to. */
export async function draftsForChat(): Promise<ChatDraft[]> {
  const { drafts } = await getReviewQueue();
  return drafts.map((d) => {
    const n = d.reading ? normalize(d.reading) : null;
    return {
      draft_id: d.id,
      name: d.reading?.name || d.requestedName || "(still reading)",
      state: d.state,
      read_in: d.client,
      per_100g: n?.per100 ?? null,
      servings: n?.servings ?? [],
      ...(d.reference ? { table_row: d.reference.name } : {}),
      warnings: d.reading && n?.per100 ? warningsFor(d.reading, n.per100, d.reference) : [],
      problems: n?.problems ?? (d.error ? [d.error] : []),
    };
  });
}

/**
 * Confirms a draft from a chat, from any surface: one read in Claude, or a
 * photo read in the app. Corrections are applied first, so what is saved is
 * what the person agreed to.
 */
export async function confirmFromChat(
  me: User,
  client: Client,
  draftId: number,
  correction: Correction,
): Promise<FoodView> {
  const { drafts } = await getReviewQueue();
  const draft = drafts.find((d) => d.id === draftId);
  if (!draft) throw new Error("That draft is no longer waiting. It may already be confirmed.");
  if (!draft.reading) throw new Error("That draft hasn't been read yet. Try again in a moment.");
  await confirmDraft(me, draftId, corrected(draft.reading, correction), draft.reference?.id ?? null, client);
  return (await getFood(draftId))!;
}
