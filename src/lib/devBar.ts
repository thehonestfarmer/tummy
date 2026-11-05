/**
 * Whether the dev strip is showing, remembered per device. A UI preference, so
 * localStorage is the right place, and losing it just brings the strip back.
 */
export const DEV_BAR_KEY = "tb:dev-bar-hidden";
export const DEV_BAR_TOGGLE = "tb:dev-bar-toggle";

export function devBarHidden(): boolean {
  try {
    return localStorage.getItem(DEV_BAR_KEY) === "1";
  } catch {
    return false;
  }
}

export function toggleDevBar() {
  const hidden = !devBarHidden();
  try {
    if (hidden) localStorage.setItem(DEV_BAR_KEY, "1");
    else localStorage.removeItem(DEV_BAR_KEY);
  } catch {
    // Private mode: the toggle still works for this page, it just isn't remembered.
  }
  window.dispatchEvent(new CustomEvent(DEV_BAR_TOGGLE, { detail: hidden }));
}
