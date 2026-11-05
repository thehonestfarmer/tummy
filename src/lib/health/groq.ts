import "server-only";
import { z } from "zod";

/**
 * Groq, for the two steps someone is waiting on with the phone in their
 * hand: transcribing a held-down mic, and parsing the sentence it produced
 * (healthspec.md §9). Plain fetch against Groq's OpenAI-compatible API; the
 * Whisper call mirrors the one in hypernpc's live STT service.
 */

const BASE = "https://api.groq.com/openai/v1";
const TIMEOUT_MS = 20_000;

/** Turbo: much faster than large-v3 for little loss on a sentence-long clip. */
const WHISPER_MODEL = process.env.GROQ_WHISPER_MODEL ?? "whisper-large-v3-turbo";

/**
 * gpt-oss-20b by measurement: on seven test sentences (counts, grams,
 * "an hour ago", two foods at once, "we split", corrections, undo) it got
 * every one right at a median of 0.68s. qwen3.8-27b was twice as fast but
 * left amounts inside the phrase and missed the correction; gpt-oss-120b was
 * as accurate and slower. Override with GROQ_PARSE_MODEL.
 */
export function parseModel(): string {
  return process.env.GROQ_PARSE_MODEL || "openai/gpt-oss-20b";
}

export function groqConfigured(): boolean {
  return !!process.env.GROQ_API_KEY;
}

function key(): string {
  const k = process.env.GROQ_API_KEY;
  if (!k) throw new Error("GROQ_API_KEY is not set, so voice logging isn't available.");
  return k;
}

/**
 * Speech to text. English, because that is how we talk to it, with Japanese
 * food words in romaji; the prompt carries the library's own names so
 * "shoyu senbei" comes back spelled the way the library spells it.
 */
export async function transcribe(audio: Blob, filename: string, vocabulary: string[]): Promise<string> {
  const form = new FormData();
  form.append("file", audio, filename);
  form.append("model", WHISPER_MODEL);
  form.append("language", "en");
  form.append("temperature", "0");
  form.append("response_format", "json");
  // Whisper reads at most 224 tokens of prompt; the most-used names come first.
  const prompt = `Food log. ${vocabulary.join(", ")}`.slice(0, 600);
  form.append("prompt", prompt);

  const res = await fetch(`${BASE}/audio/transcriptions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}` },
    body: form,
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // The key must never reach a log or a message.
    console.error(`[tummy] groq transcription ${res.status}: ${detail.slice(0, 200)}`);
    throw new Error("Couldn't make out the recording. Try again, or type it.");
  }
  const body = (await res.json()) as { text?: string };
  return (body.text ?? "").trim();
}

/**
 * A strict-JSON completion, validated against `schema` on arrival. Groq
 * enforces the JSON schema server-side for the models that support it; zod
 * checks again here, because a malformed log must never be committed.
 */
export async function groqJson<S extends z.ZodType>(opts: {
  system: string;
  user: string;
  schema: S;
  name: string;
  model?: string;
}): Promise<z.infer<S>> {
  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: { authorization: `Bearer ${key()}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: opts.model ?? parseModel(),
      temperature: 0,
      messages: [
        { role: "system", content: opts.system },
        { role: "user", content: opts.user },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.name, strict: true, schema: z.toJSONSchema(opts.schema, { target: "draft-7" }) },
      },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error(`[tummy] groq ${opts.name} ${res.status}: ${detail.slice(0, 300)}`);
    throw new Error("Couldn't understand that. Try again, or type it.");
  }
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content ?? "";
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("Couldn't understand that. Try again, or type it.");
  }
  const parsed = opts.schema.safeParse(json);
  if (!parsed.success) {
    console.error(`[tummy] groq ${opts.name} returned an unexpected shape`, parsed.error.issues.slice(0, 3));
    throw new Error("Couldn't understand that. Try again, or type it.");
  }
  return parsed.data;
}
