import "server-only";

/**
 * The app itself has no logout button, by design — the PIN is the identity and
 * the cookie lasts a year. These are testing affordances so one phone can walk
 * both sides of a pair. On in dev; elsewhere they need an explicit opt-in, so a
 * Vercel preview can have them and the real deploy can't.
 */
export function sessionToolsEnabled(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.DEV_SESSION_TOOLS === "1";
}
