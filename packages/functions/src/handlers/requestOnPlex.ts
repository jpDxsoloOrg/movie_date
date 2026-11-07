import {
  resolveMediaType,
  type FieldArguments,
  type Movie,
  type PlexStatus,
  type Show,
} from "@movie-date/core";
import { ForbiddenError, RateLimitedError, ValidationError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import { userLimit } from "../lib/keys.js";
import { consume, dayWindow, refund } from "../lib/limits.js";
import {
  createRequest,
  outcomeUnknown,
  PlexRequestUnavailableError,
  type PlexAccount,
  type RequestDraft,
} from "../lib/plexRequest.js";
import { checkedMovieId, loadPlexStatus, loadShowPlexStatus, REQUESTED } from "../lib/plexStatus.js";
import { getOrCreateProfile } from "../lib/rooms.js";
import { getMovie } from "../lib/tmdb.js";
import { getShowRecord, type ShowRecord } from "../lib/tmdbTv.js";

const MAX_REQUESTS_PER_DAY = 10;

function posterPath(posterUrl: string | null): string {
  return posterUrl?.slice(posterUrl.lastIndexOf("/")) ?? "";
}

function yearText(year: number | null): string {
  return year === null ? "" : String(year);
}

function movieDraft(movie: Movie, account: PlexAccount): RequestDraft {
  return {
    ...account,
    tmdbId: movie.id,
    title: movie.title,
    year: yearText(movie.releaseYear),
    overview: movie.overview,
    posterPath: posterPath(movie.posterUrl),
  };
}

/** Every season is the same as saying nothing, which is what Plex Request's own site sends. */
function chosenSeasons(seasons: readonly number[] | null | undefined, show: Show): number[] | undefined {
  if (seasons === null || seasons === undefined) return undefined;
  const unique = [...new Set(seasons)].sort((first, second) => first - second);
  const last = show.seasonCount ?? Number.POSITIVE_INFINITY;
  if (unique.length === 0 || unique.some((season) => !Number.isInteger(season) || season < 1 || season > last)) {
    throw new ValidationError("Pick seasons this show has.");
  }
  return unique.length === show.seasonCount ? undefined : unique;
}

function showDraft(
  { show, tvdbId }: ShowRecord,
  seasons: readonly number[] | null | undefined,
  account: PlexAccount,
): RequestDraft {
  if (tvdbId === null) throw new ValidationError("This show can't be requested on Plex.");
  const chosen = chosenSeasons(seasons, show);
  return {
    ...account,
    mediaType: "tv",
    tvdbId,
    ...(chosen ? { seasons: chosen } : {}),
    title: show.title,
    year: yearText(show.firstAirYear),
    overview: show.overview,
    posterPath: posterPath(show.posterUrl),
  };
}

export async function requestOnPlex(
  { movieId, mediaType, seasons }: FieldArguments["requestOnPlex"],
  context: ResolverContext,
): Promise<PlexStatus> {
  const isShow = resolveMediaType(mediaType) === "TV";
  checkedMovieId(movieId);
  if (!isShow && seasons) throw new ValidationError("Only a show has seasons.");
  const { plexUserId, plexEmail } = await getOrCreateProfile(context);
  if (!plexUserId || !plexEmail) throw new ForbiddenError("Link Plex Request first.");

  // POST /requests only looks for active requests, so a title already in the
  // library would otherwise be requested again.
  const status = await (isShow ? loadShowPlexStatus(movieId, plexUserId) : loadPlexStatus(movieId, plexUserId));
  if (!status.canRequest) return status;

  // Before the limit: a title TMDB can't find shouldn't cost a request.
  const account = { userId: plexUserId, email: plexEmail };
  const draft = isShow
    ? showDraft(await getShowRecord(movieId), seasons, account)
    : movieDraft(await getMovie(movieId), account);

  const limit = userLimit(context.userId, "plex-request", dayWindow());
  if (!(await consume(limit, MAX_REQUESTS_PER_DAY))) {
    throw new RateLimitedError("That's today's limit for Plex requests. Try again tomorrow.");
  }
  try {
    await createRequest(draft);
  } catch (error) {
    if (!(error instanceof PlexRequestUnavailableError)) throw error;
    // Offering it again could send a second request, so this counts as sent.
    if (outcomeUnknown(error)) return REQUESTED;
    await refund(limit);
    throw error;
  }
  return REQUESTED;
}
