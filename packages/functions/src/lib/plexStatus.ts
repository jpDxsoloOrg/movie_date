import type { PlexStatus } from "@movie-date/core";
import { ValidationError } from "./errors.js";
import { hasFileOnPlex } from "./plexIndex.js";
import { movieStatus } from "./plexRequest.js";

export const AVAILABLE: PlexStatus = { availability: "AVAILABLE", canRequest: false };
export const REQUESTED: PlexStatus = { availability: "REQUESTED", canRequest: false };
/** canRequest false on a missing title is how the UI knows requests are down. */
export const REQUESTS_DOWN: PlexStatus = { availability: "NOT_IN_LIBRARY", canRequest: false };

export function checkedMovieId(movieId: number): number {
  if (!Number.isInteger(movieId) || movieId < 1) throw new ValidationError("Invalid movie id.");
  return movieId;
}

/**
 * The index answers for titles with a file, which spares a Lambda invocation on
 * every card; the account's concurrency is tight. REQUESTED outranks MONITORED
 * because an approved request is in both states and the request says more.
 */
export async function loadPlexStatus(movieId: number, plexUserId: string): Promise<PlexStatus> {
  if (await hasFileOnPlex(movieId)) return AVAILABLE;
  const { hasActiveRequest, hasFile, inLibrary } = await movieStatus(movieId, plexUserId);
  if (hasFile) return AVAILABLE;
  if (hasActiveRequest) return REQUESTED;
  if (inLibrary) return { availability: "MONITORED", canRequest: false };
  return { availability: "NOT_IN_LIBRARY", canRequest: true };
}
