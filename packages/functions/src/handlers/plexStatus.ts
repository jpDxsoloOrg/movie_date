import { resolveMediaType, type FieldArguments, type PlexStatus } from "@movie-date/core";
import type { ResolverContext } from "../lib/identity.js";
import { PlexRequestUnavailableError } from "../lib/plexRequest.js";
import { checkedMovieId, loadPlexStatus, loadShowPlexStatus, REQUESTS_DOWN } from "../lib/plexStatus.js";
import { getOrCreateProfile } from "../lib/rooms.js";

export async function plexStatus(
  { movieId, mediaType }: FieldArguments["plexStatus"],
  context: ResolverContext,
): Promise<PlexStatus | null> {
  checkedMovieId(movieId);
  const { plexUserId } = await getOrCreateProfile(context);
  if (!plexUserId) return null;
  try {
    return resolveMediaType(mediaType) === "TV"
      ? await loadShowPlexStatus(movieId, plexUserId)
      : await loadPlexStatus(movieId, plexUserId);
  } catch (error) {
    if (error instanceof PlexRequestUnavailableError) return REQUESTS_DOWN;
    throw error;
  }
}
