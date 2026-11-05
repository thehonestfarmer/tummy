/**
 * Where a write came from (mcpspec.md §2, principle 9): the app itself, or
 * an assistant over MCP. Recorded on every food, entry and confirmation, so a
 * bad batch from one surface can be traced and fixed.
 */
export type Client = "pwa" | "claude" | "chatgpt";

export const CLIENTS: readonly Client[] = ["pwa", "claude", "chatgpt"];

export function isClient(v: unknown): v is Client {
  return typeof v === "string" && (CLIENTS as readonly string[]).includes(v);
}

/** How a chat client names itself in words, for tool results and the review screen. */
export const CLIENT_NAMES: Record<Client, string> = { pwa: "the app", claude: "Claude", chatgpt: "ChatGPT" };
