import { ANY_SERVICE } from "@movie-date/core";
import type { FiltersInput } from "../../services/api";

interface StashedDraft {
  roomId: string;
  draft: FiltersInput;
}

/**
 * Filters unmounts on the way to ActorSearch, and a browser back can't carry
 * router state, so the unsaved form waits here. It's keyed by room so a draft
 * can't follow someone into another room or account.
 */
let stashed: StashedDraft | null = null;

export function stashFilterDraft(roomId: string, draft: FiltersInput): void {
  stashed = { roomId, draft };
}

export function peekFilterDraft(roomId: string): FiltersInput | null {
  return stashed?.roomId === roomId ? stashed.draft : null;
}

export function clearFilterDraft(): void {
  stashed = null;
}

/** The schema says an empty list means any service, so the marker is never saved. */
export function normaliseServices(services: readonly string[]): string[] {
  return services.includes(ANY_SERVICE) ? [] : [...services];
}
