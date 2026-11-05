import "server-only";
import { z } from "zod";

/**
 * One structured call to Gemini, for label reading while it is compared with
 * Claude (healthspec.md §9). Shaped like hank-api's client: a plain fetch to
 * generateContent, with the answer forced through a single function call so
 * it comes back as typed arguments rather than prose.
 */

const API = "https://generativelanguage.googleapis.com/v1beta";
const FUNCTION = "submit_reading";

export function geminiConfigured(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

type Part = { text: string } | { inline_data: { mime_type: string; data: string } };

type Response = {
  candidates?: { content?: { parts?: { functionCall?: { name: string; args?: unknown }; text?: string }[] }; finishReason?: string }[];
  modelVersion?: string;
  promptFeedback?: { blockReason?: string };
};

export async function geminiJson<S extends z.ZodType>(opts: {
  model: string;
  system: string;
  parts: Part[];
  schema: S;
  /** What failed, in the words the error should use: "read that label". */
  task: string;
}): Promise<{ output: z.infer<S>; servedBy: string; latencyMs: number }> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set, so Gemini can't read labels.");
  const started = Date.now();

  const res = await fetch(`${API}/models/${opts.model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: opts.system }] },
      contents: [{ role: "user", parts: opts.parts }],
      tools: [
        {
          function_declarations: [
            {
              name: FUNCTION,
              description: "Submit what you read.",
              parameters_json_schema: z.toJSONSchema(opts.schema, { target: "draft-2020-12" }),
            },
          ],
        },
      ],
      // ANY: it must answer through the function, never in prose.
      tool_config: { function_calling_config: { mode: "ANY", allowed_function_names: [FUNCTION] } },
    }),
  }).catch(() => null);

  if (!res) throw new Error("Gemini is unreachable. Retry shortly.");
  if (res.status === 429) throw new Error("Too many requests at once. Retry in a minute.");
  if (res.status === 402) throw new Error("The Gemini account is out of credit. Top it up in AI Studio.");
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[tummy] gemini ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error(`Gemini rejected the request (${res.status}).`);
  }

  const json = (await res.json()) as Response;
  if (json.promptFeedback?.blockReason) throw new Error(`Gemini declined to ${opts.task}.`);
  const call = json.candidates?.[0]?.content?.parts?.find((p) => p.functionCall)?.functionCall;
  if (!call) throw new Error(`Couldn't ${opts.task}.`);
  const parsed = opts.schema.safeParse(call.args);
  if (!parsed.success) {
    console.error("[tummy] gemini returned an unexpected shape", parsed.error.issues.slice(0, 3));
    throw new Error(`Couldn't ${opts.task}.`);
  }
  return { output: parsed.data, servedBy: json.modelVersion ?? opts.model, latencyMs: Date.now() - started };
}
