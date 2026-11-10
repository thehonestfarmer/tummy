"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { prepare, type Prepared } from "@/lib/resize";
import { uploadFoodImage } from "@/lib/health/upload";

type Staged = {
  key: number;
  file: Prepared;
  url: string;
  /** Same packet as the photo above it: a front to go with a back. */
  joined: boolean;
};

let seq = 0;

/** Several packets in flight at once, but not so many that a phone on 4G chokes. */
const CONCURRENCY = 3;

/**
 * The seeding screen (healthspec.md §5.3): photograph the kitchen in one
 * sitting. Each photo is one packet unless it's joined to the one above, and
 * every packet becomes a draft that is read in the background, so nothing
 * here waits on a model.
 */
export function BulkAdd({ waiting }: { waiting: number }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [staged, setStaged] = useState<Staged[]>([]);
  const [preparing, setPreparing] = useState(0);
  const [sending, setSending] = useState<number | null>(null);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Object URLs hold the decoded image in memory until released.
  const urls = useRef(new Set<string>());
  useEffect(() => {
    const held = urls.current;
    return () => held.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  const release = (items: Staged[]) =>
    items.forEach((s) => {
      URL.revokeObjectURL(s.url);
      urls.current.delete(s.url);
    });

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (!picked.length) return;
    setError(null);
    setPreparing((n) => n + picked.length);
    // One at a time: a canvas per 12MP photo, forty deep, is how a phone runs out of memory.
    for (const raw of picked) {
      try {
        const file = await prepare(raw);
        const url = URL.createObjectURL(file.blob);
        urls.current.add(url);
        setStaged((s) => [...s, { key: seq++, file, url, joined: false }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Couldn't read one of those photos");
      } finally {
        setPreparing((n) => n - 1);
      }
    }
  }

  /** A photo can join the one above only if that one isn't already the second of a pair. */
  const canJoin = (i: number) => i > 0 && !staged[i - 1].joined;

  function toggleJoin(i: number) {
    setStaged((s) => s.map((item, j) => (j === i ? { ...item, joined: !item.joined } : item)));
  }

  function remove(i: number) {
    setStaged((s) => {
      release([s[i]]);
      const next = s.filter((_, j) => j !== i);
      // The photo that took its place can't stay joined to something it was never next to.
      if (next[i]?.joined && (i === 0 || next[i - 1]?.joined)) next[i] = { ...next[i], joined: false };
      return next;
    });
  }

  function packets(items: Staged[]): Staged[][] {
    const out: Staged[][] = [];
    for (const item of items) {
      if (item.joined && out.length) out[out.length - 1].push(item);
      else out.push([item]);
    }
    return out;
  }

  async function send() {
    const queue = packets(staged);
    if (!queue.length) return;
    setError(null);
    setSending(queue.length);
    const failed: Staged[][] = [];
    let done = 0;

    async function worker() {
      while (queue.length) {
        const packet = queue.shift()!;
        try {
          const images = [];
          for (const photo of packet) images.push(await uploadFoodImage(photo.file));
          const res = await fetch("/api/foods", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ images }),
          });
          if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Couldn't save that one");
          release(packet);
          done += 1;
          setSent((n) => n + 1);
          setStaged((s) => s.filter((item) => !packet.includes(item)));
        } catch (err) {
          failed.push(packet);
          setError(err instanceof Error ? err.message : "Upload failed");
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setSending(null);
    if (failed.length) {
      setError(`Sent ${done}. ${failed.length} didn't go; they're still here to retry.`);
    }
  }

  const count = packets(staged).length;
  const busy = sending !== null;

  return (
    <div className="px-5 pt-3 pb-6">
      <h1 className="text-[1.15rem] leading-none">Add foods</h1>
      <p className="pt-2 text-[0.95rem] leading-relaxed text-ink-dim">
        One photo per packet, of the nutrition table. That&rsquo;s all a packet needs.
      </p>

      <input ref={camera} type="file" accept="image/*" capture="environment" onChange={onPick} className="hidden" />
      <input ref={library} type="file" accept="image/*" multiple onChange={onPick} className="hidden" />

      <div className="flex gap-2 pt-4">
        <button
          onClick={() => camera.current?.click()}
          disabled={busy}
          className="flex-1 rounded-[10px] border border-hairline-strong bg-ground-raised py-3.5 text-[1rem] text-ink disabled:text-ink-faint"
        >
          Take a photo
        </button>
        <button
          onClick={() => library.current?.click()}
          disabled={busy}
          className="flex-1 rounded-[10px] border border-hairline bg-ground-raised py-3.5 text-[1rem] text-ink-dim disabled:text-ink-faint"
        >
          From library
        </button>
      </div>

      {preparing > 0 ? <p className="pt-3 text-[0.9rem] text-ink-dim">Preparing {preparing}…</p> : null}

      {staged.length ? (
        <ul className="pt-4">
          {staged.map((item, i) => (
            <li
              key={item.key}
              className={`flex items-center gap-3 ${item.joined ? "pt-1.5" : "mt-1.5 border-t border-hairline pt-3"}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.url}
                alt=""
                className={`shrink-0 rounded-[2px] border border-hairline object-cover ${item.joined ? "ml-6 h-12 w-12" : "h-16 w-16"}`}
              />
              <div className="min-w-0 flex-1 text-[0.9rem] text-ink-dim">
                {item.joined ? "Same packet" : `Packet ${packets(staged.slice(0, i + 1)).length}`}
              </div>
              {canJoin(i) || item.joined ? (
                <button
                  onClick={() => toggleJoin(i)}
                  disabled={busy}
                  className="rounded-[10px] border border-hairline px-2.5 py-1.5 text-[0.8rem] text-ink-dim"
                >
                  {item.joined ? "Separate" : "Join above"}
                </button>
              ) : null}
              <button
                onClick={() => remove(i)}
                disabled={busy}
                className="px-1.5 py-1.5 text-[0.8rem] text-ink-faint"
                aria-label="Remove"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {count ? (
        <button
          onClick={send}
          disabled={busy || preparing > 0}
          className="mt-5 w-full rounded-[10px] border border-hairline-strong bg-ground-raised py-3.5 text-[1rem] text-ink disabled:text-ink-faint"
        >
          {busy ? `Sending ${sent} of ${sent + count}…` : `Send ${count} packet${count === 1 ? "" : "s"} to be read`}
        </button>
      ) : null}

      {error ? <p className="pt-3 text-center text-[0.85rem] text-ink-dim">{error}</p> : null}

      {sent > 0 || waiting > 0 ? (
        <p className="pt-5 text-[0.95rem] text-ink-dim">
          {sent > 0 ? `Sent ${sent}. ` : ""}
          <Link href="/review" className="text-ink underline decoration-hairline-strong underline-offset-4">
            Review what&rsquo;s been read
          </Link>
        </p>
      ) : null}
    </div>
  );
}
