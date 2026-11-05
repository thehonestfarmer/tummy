import { JPEG_QUALITY, MAX_EDGE_PX } from "./config";

export type Prepared = {
  blob: Blob;
  width: number;
  height: number;
};

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image"));
    };
    img.src = url;
  });
}

/**
 * Phone photos are 4-8MB, often sent over mobile data. A label reads fine at
 * MAX_EDGE_PX. Re-encoding through a canvas also drops EXIF, location
 * included, which is the behaviour we want anyway.
 */
export async function prepare(file: File): Promise<Prepared> {
  const img = await load(file);
  const scale = Math.min(1, MAX_EDGE_PX / Math.max(img.naturalWidth, img.naturalHeight));
  const width = Math.max(1, Math.round(img.naturalWidth * scale));
  const height = Math.max(1, Math.round(img.naturalHeight * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not process that image");
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
  );
  if (!blob) throw new Error("Could not process that image");

  return { blob, width, height };
}
