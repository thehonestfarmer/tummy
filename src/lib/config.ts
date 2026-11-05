/**
 * The zone that stands in for "today" until a phone has said where it is
 * (healthspec.md §4). In Japan, Korea and Taiwan the date is the same anyway.
 */
export const ANCHOR_TZ = "Asia/Tokyo";
/** Photos are resized on the phone before they leave it: plenty for a label. */
export const MAX_EDGE_PX = 2000;
export const JPEG_QUALITY = 0.85;

export const APP_NAME = "Tummy";
export type Slug = "bunny" | "bear";
/** Fixed order everywhere: Bunny then Bear. */
export const PAIR_ORDER: Slug[] = ["bunny", "bear"];
