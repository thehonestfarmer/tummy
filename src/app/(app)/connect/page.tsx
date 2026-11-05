import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { tokenFor } from "@/lib/health/tokens";
import { ConnectSettings } from "@/components/health/ConnectSettings";

export const dynamic = "force-dynamic";

/** Setting up logging from outside the app: the connector for Claude and ChatGPT. */
export default async function ConnectPage() {
  const user = await getUser();
  if (!user) redirect("/");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return <ConnectSettings origin={`${proto}://${host}`} initialToken={await tokenFor(user)} name={user.displayName} />;
}
