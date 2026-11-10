import { redirect } from "next/navigation";
import { bothUsers, getUser } from "@/lib/auth";
import { sessionToolsEnabled } from "@/lib/devtools";
import { PAIR_ORDER } from "@/lib/config";
import { getHealthDay } from "@/lib/health/entries";
import { requestZone } from "@/lib/health/requestZone";
import { dateIn } from "@/lib/health/zone";
import { AppHeader } from "@/components/AppHeader";
import { BottomChrome } from "@/components/BottomChrome";
import { InstallHint } from "@/components/InstallHint";
import { ServiceWorker } from "@/components/ServiceWorker";
import { DevSessionBar } from "@/components/DevSessionBar";
import { HealthDayProvider } from "@/components/health/HealthDay";
import { HealthTop } from "@/components/health/HealthTop";
import { ZoneCookie } from "@/components/health/ZoneCookie";

export const dynamic = "force-dynamic";

/**
 * Every screen sits under the macro display, fed by one shared day
 * (healthspec.md §8). There are no tabs: Home is the app, and the header
 * leads everywhere else.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getUser();
  if (!user) redirect("/");

  const tz = await requestZone();
  const day = await getHealthDay(user, dateIn(tz));

  let devBar = null;
  if (sessionToolsEnabled()) {
    const users = await bothUsers();
    const partner = PAIR_ORDER.map((s) => users[s]).find((u) => u.id !== user.id);
    devBar = (
      <DevSessionBar
        displayName={user.displayName}
        partnerName={partner?.displayName ?? "partner"}
      />
    );
  }

  // An estimate of the bottom chrome, available before any JS runs. BottomChrome
  // replaces it with a measured value on hydration (an inline style on :root beats
  // this rule), but until then everything pinned above the chrome needs a number
  // that is too big rather than too small — too small puts it *behind* the chrome.
  const chromeEstimate =
    `calc(var(--dock-h) + var(--safe-bottom)${devBar ? " + 2.75rem" : ""})`;

  return (
    <div className="mx-auto min-h-dvh max-w-2xl" style={{ paddingTop: "var(--safe-top)" }}>
      <style>{`:root{--bottom-chrome:${chromeEstimate}}`}</style>
      <ServiceWorker />
      <InstallHint />
      <HealthDayProvider initial={day}>
        <AppHeader />
        <ZoneCookie serverZone={tz} />
        <HealthTop />
        {/* BottomChrome measures itself into --bottom-chrome; the rule above covers
            the first paint and anything without a ResizeObserver. */}
        <main style={{ paddingBottom: "var(--bottom-chrome)" }}>
          {children}
        </main>
        {/* Inside the provider: the dock logs food, and reads the day on show. */}
        <BottomChrome>{devBar}</BottomChrome>
      </HealthDayProvider>
    </div>
  );
}
