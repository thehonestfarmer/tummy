import "server-only";
import { z } from "zod";
import { sql } from "../db";
import type { User } from "../auth";
import { partnerOf, targetFor } from "./entries";

/**
 * Each person's guidance (mcpspec.md §7): the rules an assistant reads before
 * giving any nutrition or training advice. Stored per section so one can
 * change without touching the rest; targets come live from the database.
 */

export const SECTIONS = ["standing_rules", "fasting", "safety_stops", "weight", "training", "tone"] as const;
export type Section = (typeof SECTIONS)[number];
export const SectionSchema = z.enum(SECTIONS);

const TITLES: Record<Section, string> = {
  standing_rules: "Standing rules",
  fasting: "Fasting",
  safety_stops: "Safety stops",
  weight: "Weight",
  training: "Training",
  tone: "Tone",
};

export type Guidelines = {
  person: string;
  targets: { as_of: string; kcal: number; protein_g: number; fat_g: number; carbs_g: number } | null;
  sections: { section: Section; title: string; text: string; updated_at: string | null }[];
};

async function whose(me: User, who: "me" | "partner"): Promise<User> {
  return who === "me" ? me : partnerOf(me);
}

export async function getGuidelines(me: User, who: "me" | "partner", today: string): Promise<Guidelines> {
  const person = await whose(me, who);
  const [target, rows] = await Promise.all([
    targetFor(person.id, today),
    sql<{ section: Section; body: string; updated_at: Date }[]>`
      select section, body, updated_at from guidance where user_id = ${person.id}`,
  ]);
  const by = new Map(rows.map((r) => [r.section, r]));
  return {
    person: person.displayName,
    targets: target ? { as_of: today, ...target } : null,
    sections: SECTIONS.map((s) => ({
      section: s,
      title: TITLES[s],
      text: by.get(s)?.body ?? "",
      updated_at: by.get(s)?.updated_at.toISOString() ?? null,
    })),
  };
}

/** Replaces one section. Either of you can edit either person's (§7). */
export async function updateGuideline(me: User, who: "me" | "partner", section: Section, text: string) {
  const body = text.trim();
  if (!body) throw new Error("That section can't be empty.");
  if (body.length > 4000) throw new Error("That's too long for one section.");
  const person = await whose(me, who);
  await sql`
    insert into guidance (user_id, section, body, updated_by, updated_at)
    values (${person.id}, ${section}, ${body}, ${me.id}, now())
    on conflict (user_id, section) do update
      set body = excluded.body, updated_by = excluded.updated_by, updated_at = now()`;
  return { person: person.displayName, section, title: TITLES[section], text: body };
}
