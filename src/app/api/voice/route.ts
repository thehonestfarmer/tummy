import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { transcribe } from "@/lib/health/groq";
import { quickLog, vocabularyFor } from "@/lib/health/quicklog";
import { requestZone } from "@/lib/health/requestZone";

export const dynamic = "force-dynamic";

/** A minute is far past any food sentence; the recorder stops itself well before. */
const MAX_BYTES = 4 * 1024 * 1024;

/**
 * The mic (§5.5): a held-down recording, transcribed by Groq Whisper with
 * the library's own names as a hint, then the same quick log as typing.
 * The transcript comes back with the result, so a mishearing is visible.
 */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const audio = form?.get("audio");
  if (!(audio instanceof Blob) || audio.size === 0) {
    return NextResponse.json({ error: "Nothing was recorded." }, { status: 400 });
  }
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: "That recording is too long." }, { status: 400 });
  const tz = await requestZone();
  return withUser(async (user) => {
    const type = audio.type || "audio/webm";
    const ext = type.includes("mp4") || type.includes("aac") ? "m4a" : type.includes("ogg") ? "ogg" : "webm";
    const text = await transcribe(audio, `clip.${ext}`, await vocabularyFor(user.id));
    if (!text) throw new Error("Didn't catch anything. Try again.");
    return quickLog(user, text, { tz, source: "voice" });
  });
}
