import { useLocation, type Location } from "react-router-dom";

/** Router state a guard leaves behind when it diverts someone. */
export interface ReturnState {
  from?: string;
}

export function currentPath(location: Pick<Location, "pathname" | "search" | "hash">): string {
  return `${location.pathname}${location.search}${location.hash}`;
}

export function returnPathFrom(state: unknown): string {
  const from = (state as ReturnState | null)?.from;
  return typeof from === "string" && from.startsWith("/") && !from.startsWith("//") ? from : "/";
}

/** Where to go once a diverted flow (login, tutorial) finishes. "/" if nothing was interrupted. */
export function useReturnPath(): string {
  return returnPathFrom(useLocation().state);
}
