import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import type { z } from "zod";

/**
 * One structured-output call to Claude, shared by label reading, reference
 * matching and adding a food by name. Every caller gets JSON validated
 * against its schema, or an `Error` worded for the person waiting on it.
 */

export function claudeConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/** For text-only judgement calls: picking a table row, interpreting a food name. */
export function textModel(): string {
  return process.env.HEALTH_TEXT_MODEL || "claude-opus-5";
}

let cached: Anthropic | null = null;
function client(): Anthropic {
  if (!claudeConfigured()) throw new Error("ANTHROPIC_API_KEY is not set, so food can't be read or matched.");
  cached ??= new Anthropic();
  return cached;
}

export type Effort = "low" | "medium" | "high";

export async function claudeJson<S extends z.ZodType>(opts: {
  model: string;
  system: string;
  content: Anthropic.Beta.BetaContentBlockParam[];
  schema: S;
  effort?: Effort;
  /** What failed, in the words the error should use: "read that label". */
  task: string;
}): Promise<{ output: z.infer<S>; servedBy: string; latencyMs: number }> {
  const started = Date.now();
  try {
    const res = await client().beta.messages.parse({
      model: opts.model,
      max_tokens: 16000,
      thinking: { type: "adaptive" },
      // A declined request retries server-side on a model Anthropic picks for
      // that refusal category, instead of failing outright. Food is not going
      // to trip a classifier often, but it costs nothing to opt in.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system: opts.system,
      messages: [{ role: "user", content: opts.content }],
      output_config: {
        format: betaZodOutputFormat(opts.schema),
        ...(opts.effort ? { effort: opts.effort } : {}),
      },
    });

    if (res.stop_reason === "refusal") throw new Error(`The model declined to ${opts.task}.`);
    if (res.stop_reason === "max_tokens") throw new Error(`Ran out of room trying to ${opts.task}. Try again.`);
    if (!res.parsed_output) throw new Error(`Couldn't ${opts.task}.`);
    return { output: res.parsed_output as z.infer<S>, servedBy: res.model, latencyMs: Date.now() - started };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) throw new Error("Too many requests at once. Retry in a minute.");
    if (err instanceof Anthropic.AuthenticationError) throw new Error("The Anthropic key was rejected.");
    if (err instanceof Anthropic.BadRequestError) throw new Error(`The model rejected the request: ${err.message.slice(0, 160)}`);
    if (err instanceof Anthropic.APIError) throw new Error(`The model is unavailable (${err.status ?? "network"}). Retry shortly.`);
    throw err;
  }
}
