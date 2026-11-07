import { useSyncExternalStore } from "react";

export type Breakpoint = "mobile" | "tablet" | "desktop";

/** Keep in step with the literal widths in the CSS media queries. */
export const TABLET_MIN_WIDTH = 640;
export const DESKTOP_MIN_WIDTH = 1024;

const TABLET_QUERY = `(min-width: ${TABLET_MIN_WIDTH}px)`;
const DESKTOP_QUERY = `(min-width: ${DESKTOP_MIN_WIDTH}px)`;

function mediaList(query: string): MediaQueryList | null {
  return typeof window.matchMedia === "function" ? window.matchMedia(query) : null;
}

function currentBreakpoint(): Breakpoint {
  if (mediaList(DESKTOP_QUERY)?.matches) return "desktop";
  return mediaList(TABLET_QUERY)?.matches ? "tablet" : "mobile";
}

function subscribe(onChange: () => void): () => void {
  const lists = [mediaList(TABLET_QUERY), mediaList(DESKTOP_QUERY)];
  for (const list of lists) list?.addEventListener("change", onChange);
  return () => {
    for (const list of lists) list?.removeEventListener("change", onChange);
  };
}

/**
 * For when the DOM has to differ by viewport. If only the look differs, use a media
 * query. Read synchronously, so the first paint is already the right layout.
 */
export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, currentBreakpoint);
}
