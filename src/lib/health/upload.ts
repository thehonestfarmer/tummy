import type { Prepared } from "../resize";

/**
 * Puts one food photo in the review store and returns its URL. Food photos
 * only become a draft once every photo of the packet has landed, so this
 * stops at the URL.
 */
export async function uploadFoodImage(file: Prepared): Promise<string> {
  const body = new FormData();
  body.append("file", file.blob, "food.jpg");
  const res = await fetch("/api/images", { method: "POST", body });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Upload failed");
  return json.url as string;
}
