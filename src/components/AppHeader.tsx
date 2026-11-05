import type { Slug } from "@/lib/config";
import { HeaderMarks } from "./HeaderMarks";
import { SignOutButton } from "./SignOutButton";

/**
 * The same pair that stands above the PIN pad, shrunk to a line of chrome, with
 * whose session this is on the other end. Quiet enough to read past.
 */
export function AppHeader({
  slug,
  displayName,
  devTools,
}: {
  slug: Slug;
  displayName: string;
  devTools: boolean;
}) {
  return (
    <header className="flex items-center justify-between px-3 pt-4 pb-1">
      <HeaderMarks devTools={devTools} />
      <span className="flex items-center gap-3">
        <span
          className="text-[0.85rem] leading-none"
          style={{ color: slug === "bunny" ? "var(--bunny)" : "var(--bear)" }}
        >
          {displayName}
        </span>
        <SignOutButton />
      </span>
    </header>
  );
}
