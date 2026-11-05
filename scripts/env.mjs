import { readFileSync, existsSync } from "node:fs";

/**
 * Minimal .env reader, in the same precedence order Next uses for `next dev`.
 * Reading the same files as Next keeps `bun run migrate` pointed at the same
 * database as the app.
 */
export function loadEnv() {
  for (const file of [".env.development.local", ".env.local", ".env.development", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const value = m[2].replace(/^["']|["']$/g, "");
      if (process.env[m[1]] === undefined) process.env[m[1]] = value;
    }
  }
}
