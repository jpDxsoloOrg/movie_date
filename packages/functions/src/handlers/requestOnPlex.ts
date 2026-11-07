import {
  resolveMediaType,
  type FieldArguments,
  type Movie,
  type PlexStatus,
} from "@movie-date/core";
import { ForbiddenError, RateLimitedError, ValidationError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import { userLimit } from "../lib/keys.js";
import { consume, dayWindow, refund } from "../lib/limits.js";
import { createRequest, PlexRequestUnavailableError, type RequestDraft } from "../lib/plexRequest.js";
import { checkedMovieId, loadPlexStatus, REQUESTED } from "../lib/plexStatus.js";
import { getOrCreateProfile } from "../lib/rooms.js";
import { getMovie } from "../lib/tmdb.js";

const MAX_REQUESTS_PER_DAY = 10;

function posterPath(movie: Movie): string {
  return movie.posterUrl?.slice(movie.posterUrl.lastIndexOf("/")) ?? "";
}

function toDraft(movie: Movie, userId: string, email: string): RequestDraft {
  return {
    userId,
    email,
    tmdbId: movie.id,
    title: movie.title,
    year: movie.releaseYear === null ? "" : String(movie.releaseYear),
    overview: movie.overview,
    posterPath: posterPath(movie),
  };
}

/** Movies only until show requests are built (decision 42). A TV id must say so, or it reads as the movie with that number. */
export async function requestOnPlex(
  { movieId, mediaType }: FieldArguments["requestOnPlex"],
  context: ResolverContext,
): Promise<PlexStatus> {
  if (resolveMediaType(mediaType) === "TV") {
    throw new ValidationError("Shows can't be requested on Plex yet.");
  }
  checkedMovieId(movieId);
  const { plexUserId, plexEmail } = await getOrCreateProfile(context);
  if (!plexUserId || !plexEmail) throw new ForbiddenError("Link Plex Request first.");

  // POST /requests only looks for active requests, so a title already in the
  // library would otherwise be requested again.
  const status = await loadPlexStatus(movieId, plexUserId);
  if (!status.canRequest) return status;

  // Before the limit: a title TMDB can't find shouldn't cost a request.
  const movie = await getMovie(movieId);

  const limit = userLimit(context.userId, "plex-request", dayWindow());
  if (!(await consume(limit, MAX_REQUESTS_PER_DAY))) {
    throw new RateLimitedError("That's today's limit for Plex requests. Try again tomorrow.");
  }
  try {
    await createRequest(toDraft(movie, plexUserId, plexEmail));
  } catch (error) {
    if (error instanceof PlexRequestUnavailableError) await refund(limit);
    throw error;
  }
  return REQUESTED;
}
