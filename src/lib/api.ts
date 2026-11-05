import "server-only";
import { NextResponse } from "next/server";
import { getUser, type User } from "./auth";

export const dynamicConfig = "force-dynamic";

export async function withUser(
  handler: (user: User) => Promise<unknown>,
): Promise<NextResponse> {
  const user = await getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  try {
    return NextResponse.json(await handler(user));
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "request failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
