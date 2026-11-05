import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

/**
 * Food photos, held only while their draft waits for review (healthspec.md
 * §5.3). They live in a directory on the server's own disk, a Docker volume
 * in production, and are deleted the moment the draft is confirmed or
 * discarded. Nothing here is meant to be kept.
 *
 * Not under public/: a production build only serves the files public/ held
 * at build time, and these should only ever reach someone signed in. They are
 * served by /api/photos/[id] instead.
 */
const URL_PREFIX = "/api/photos/";
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/*
 * Runtime data, not part of the build: the ignore comments stop the bundler
 * from tracing the whole project into the standalone output in case this
 * path might reach it.
 */
function dir(): string {
  return process.env.PHOTO_DIR || path.join(/*turbopackIgnore: true*/ process.cwd(), "data", "photos");
}

/** The file behind an id, or null for anything that isn't one of ours. */
function fileFor(id: string): string | null {
  return ID.test(id) ? path.join(dir(), `${id}.jpg`) : null;
}

function idOf(url: string): string | null {
  if (!url.startsWith(URL_PREFIX)) return null;
  const id = url.slice(URL_PREFIX.length);
  return ID.test(id) ? id : null;
}

export async function putFoodPhoto(body: Buffer): Promise<string> {
  const id = randomUUID();
  await mkdir(/*turbopackIgnore: true*/ dir(), { recursive: true });
  await writeFile(/*turbopackIgnore: true*/ fileFor(id)!, body);
  return `${URL_PREFIX}${id}`;
}

/** Only ever accept a URL this store would have handed out. */
export function isStoredPhotoUrl(url: string): boolean {
  return idOf(url) !== null;
}

export async function readFoodPhoto(urlOrId: string): Promise<Buffer | null> {
  const file = fileFor(idOf(urlOrId) ?? urlOrId);
  if (!file) return null;
  try {
    return await readFile(/*turbopackIgnore: true*/ file);
  } catch {
    return null;
  }
}

export async function deleteFoodPhoto(url: string): Promise<void> {
  const id = idOf(url);
  if (id) await rm(/*turbopackIgnore: true*/ fileFor(id)!, { force: true });
}
