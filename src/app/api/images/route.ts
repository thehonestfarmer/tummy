import { NextResponse } from "next/server";
import { withUser } from "@/lib/api";
import { putFoodPhoto } from "@/lib/health/photos";

export const dynamic = "force-dynamic";

const EIGHT_MB = 8 * 1024 * 1024;

/** One food photo, already resized on the phone, into the review store. */
export async function POST(req: Request) {
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "a file is required" }, { status: 400 });
  }
  if (file.size > EIGHT_MB) {
    return NextResponse.json({ error: "That photo is too large." }, { status: 413 });
  }
  return withUser(async () => ({ url: await putFoodPhoto(Buffer.from(await file.arrayBuffer())) }));
}
