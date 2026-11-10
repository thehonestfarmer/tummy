"use client";

import { useState } from "react";

function Copyable({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="pt-3">
      <p className="pb-1 text-[0.8rem] text-ink-faint">{label}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-[10px] border border-hairline bg-ground-sunk px-2.5 py-2 text-[0.8rem] text-ink-dim">
          {value}
        </code>
        <button
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 rounded-[10px] border border-hairline px-3 py-2 text-[0.85rem] text-ink-dim"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/**
 * Logging from Claude or ChatGPT (mcpspec.md §12). The link carries your own
 * secret, which is what tells Tummy it's you, so each of you adds it to your
 * own assistant.
 */
export function ConnectSettings({ origin, initialToken, name }: { origin: string; initialToken: string; name: string }) {
  const [token, setToken] = useState(initialToken);
  const [busy, setBusy] = useState(false);
  const mcp = `${origin}/api/mcp/${token}`;
  // The same tools; the suffix only records that a write came from ChatGPT.
  const chatgpt = `${mcp}/chatgpt`;

  return (
    <div className="mt-6 border-t border-hairline pt-6">
      <h2 className="text-[1.1rem] leading-none">Claude and ChatGPT</h2>
      <p className="pt-2 text-ink-dim">These links log as {name}. Keep them to yourself.</p>

      <section className="pt-6">
        <h3 className="text-[1.05rem]">Claude</h3>
        <p className="pt-2 text-ink-dim">
          On claude.ai, open Settings → Connectors → Add custom connector, name it Tummy, and paste this link. Then it
          works from the Claude app on your phone too. Allow “log food” always, so each snack isn&rsquo;t a
          confirmation.
        </p>
        <Copyable label="Connector link" value={mcp} />
      </section>

      <section className="pt-6">
        <h3 className="text-[1.05rem]">ChatGPT</h3>
        <p className="pt-2 text-ink-dim">
          In ChatGPT, turn on developer mode, then add a connector with this link and no authentication. Logging
          from ChatGPT&rsquo;s phone app may not work yet; looking things up does.
        </p>
        <Copyable label="Connector link" value={chatgpt} />
      </section>

      <section className="pt-8">
        <button
          disabled={busy}
          onClick={async () => {
            if (!window.confirm("Make new links? The old ones stop working in Claude and ChatGPT straight away.")) return;
            setBusy(true);
            const res = await fetch("/api/token", { method: "POST" });
            if (res.ok) setToken((await res.json()).token);
            setBusy(false);
          }}
          className="text-[0.9rem] text-ink-faint underline decoration-hairline-strong underline-offset-4"
        >
          Make new links
        </button>
      </section>
    </div>
  );
}
