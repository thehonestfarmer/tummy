"use client";

import { APP_NAME } from "@/lib/config";
import { toggleDevBar } from "@/lib/devBar";
import { Mark } from "./Mark";

/**
 * The pair of marks at the top left. Where the dev strip exists, tapping them
 * shows or hides it, so it can be put away when it isn't needed without
 * spending a visible control on scaffolding. Elsewhere they are just marks.
 */
export function HeaderMarks({ devTools }: { devTools: boolean }) {
  const marks = (
    <>
      <Mark slug="bunny" className="h-[17px] w-[17px]" />
      <Mark slug="bear" className="h-[17px] w-[17px]" />
    </>
  );
  if (!devTools) {
    return (
      <span role="img" aria-label={APP_NAME} className="flex items-center gap-1.5">
        {marks}
      </span>
    );
  }
  return (
    <button
      onClick={toggleDevBar}
      aria-label="Show or hide the dev tools"
      // A bigger target than the marks themselves, without moving them.
      className="-m-2 flex items-center gap-1.5 p-2"
    >
      {marks}
    </button>
  );
}
