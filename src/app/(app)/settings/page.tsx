import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { sessionToolsEnabled } from "@/lib/devtools";
import { tokenFor } from "@/lib/health/tokens";
import { getMaintenance } from "@/lib/health/maintenance";
import { requestZone } from "@/lib/health/requestZone";
import { dateIn } from "@/lib/health/zone";
import { ConnectSettings } from "@/components/health/ConnectSettings";
import { BodySettings } from "@/components/health/Maintenance";
import { DevBarToggle } from "@/components/DevSessionBar";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

/**
 * The things set once and rarely touched (healthspec.md §8): whose session
 * this is, your body, goal and target (§6), and the connector for Claude and
 * ChatGPT.
 */
export default async function SettingsPage() {
  const user = await getUser();
  if (!user) redirect("/");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return (
    <div className="px-5 pt-3 pb-8 text-[0.95rem] leading-relaxed">
      <h1 className="text-[1.15rem] leading-none">Settings</h1>
      <section className="flex items-center justify-between gap-3 pt-5">
        <p className="text-ink-dim">
          Signed in as{" "}
          <span style={{ color: user.slug === "bunny" ? "var(--bunny)" : "var(--bear)" }}>{user.displayName}</span>
        </p>
        <SignOutButton />
      </section>
      <BodySettings initial={await getMaintenance(user, dateIn(await requestZone()))} />
      <ConnectSettings origin={`${proto}://${host}`} initialToken={await tokenFor(user)} name={user.displayName} />
      {sessionToolsEnabled() ? <DevBarToggle /> : null}
    </div>
  );
}
