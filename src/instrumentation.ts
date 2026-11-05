/**
 * Runs once when the server starts. A deploy stops the old server mid-way
 * through whatever it was reading; this picks those drafts back up.
 */
export async function register() {
  // Also runs on the edge runtime, and in `next build`, where none of this applies.
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.NEXT_PHASE === "phase-production-build") return;
  const { resumeUnreadDrafts } = await import("@/lib/health/foods");
  resumeUnreadDrafts()
    .then((n) => {
      if (n) console.log(`[tummy] read ${n} draft(s) a restart interrupted`);
    })
    .catch((err) => console.error("[tummy] couldn't resume interrupted drafts", err));
}
