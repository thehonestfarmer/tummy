"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Hold-to-talk recording on native MediaRecorder, cut down from hypernpc's
 * recorder, which was written against Safari on iOS first. Its hard-won
 * lessons are kept: Safari records AAC in MP4 and refuses every WebM type,
 * so the container is negotiated rather than assumed; the mic is only
 * offered in a secure context; and every track is stopped explicitly, or iOS
 * leaves the red recording indicator up after the recording has ended.
 */

export type RecorderState = "idle" | "starting" | "recording";

const MIME_CANDIDATES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4;codecs=mp4a.40.2", "audio/mp4", "audio/aac", ""];

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined" || typeof MediaRecorder.isTypeSupported !== "function") return "";
  return MIME_CANDIDATES.find((t) => t === "" || MediaRecorder.isTypeSupported(t)) ?? "";
}

/** Below this there is nothing to transcribe; a tap, not a sentence. */
export const MIN_RECORD_MS = 400;
/** A food sentence is a few seconds; past this it stops itself. */
const MAX_RECORD_MS = 20_000;

export function canRecord(): boolean {
  return (
    typeof window !== "undefined" &&
    window.isSecureContext &&
    typeof MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

export function useRecorder(onDone: (audio: Blob | null, ms: number) => void) {
  const [state, setState] = useState<RecorderState>("idle");
  const [error, setError] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<BlobPart[]>([]);
  const started = useRef(0);
  const wantStop = useRef(false);
  const cap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  const release = useCallback(() => {
    if (cap.current) clearTimeout(cap.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    recorder.current = null;
  }, []);

  useEffect(() => () => {
    if (recorder.current?.state === "recording") recorder.current.stop();
    release();
  }, [release]);

  const stop = useCallback(() => {
    wantStop.current = true;
    const rec = recorder.current;
    if (rec && rec.state === "recording") rec.stop();
  }, []);

  const start = useCallback(async () => {
    if (recorder.current) return;
    setError(null);
    wantStop.current = false;
    setState("starting");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.current = s;
      const type = pickMimeType();
      const rec = type ? new MediaRecorder(s, { mimeType: type }) : new MediaRecorder(s);
      recorder.current = rec;
      chunks.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.current.push(e.data);
      };
      rec.onstop = () => {
        const ms = performance.now() - started.current;
        const blob = new Blob(chunks.current, { type: rec.mimeType || type || "audio/webm" });
        release();
        setState("idle");
        done.current(ms >= MIN_RECORD_MS ? blob : null, ms);
      };
      started.current = performance.now();
      // No timeslice: iOS has produced unusable fragments when asked for chunks mid-stream.
      rec.start();
      setState("recording");
      cap.current = setTimeout(() => rec.state === "recording" && rec.stop(), MAX_RECORD_MS);
      // Released before the permission prompt finished: stop straight away.
      if (wantStop.current) rec.stop();
    } catch (err) {
      release();
      setState("idle");
      const name = err instanceof DOMException ? err.name : "";
      setError(
        name === "NotAllowedError" || name === "SecurityError"
          ? "The microphone is blocked for this site. Allow it in Safari's website settings."
          : "Couldn't start the microphone.",
      );
      done.current(null, 0);
    }
  }, [release]);

  return { state, error, start, stop };
}
