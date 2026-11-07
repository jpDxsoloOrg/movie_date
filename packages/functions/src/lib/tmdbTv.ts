import {
  DECK_LANGUAGE,
  mediaKey,
  providerIdsForServices,
  WATCH_REGION,
  type Filters,
  type Genre,
  type Show,
} from "@movie-date/core";
import { cached, DAY_SECONDS } from "./cache.js";
import { NotFoundError, ValidationError } from "./errors.js";
import { hiddenGenres, SHOW_STATUSES } from "./showFilters.js";
import {
  asNumber,
  asRecord,
  asRecords,
  asText,
  DETAILS_TTL_SECONDS,
  hydrateAll,
  imageUrl,
  INDEXED_CAST,
  pickTrailer,
  tmdbGet,
  toDiscoverPage,
  yearOf,
  type DiscoverPage,
  type JsonRecord,
} from "./tmdb.js";

/** The offer buckets a provider can sit in; `discover/tv` doesn't separate them either. */
const OFFER_BUCKETS = ["flatrate", "free", "ads", "rent", "buy"] as const;

/** Appearing as themselves isn't a role: chat shows, award nights, clip shows. */
const SELF_CREDIT = /^self\b/i;

function showPath(showId: number): string {
  if (!Number.isInteger(showId) || showId < 1) throw new ValidationError("Invalid show id.");
  return `tv/${showId}`;
}

/** `episode_run_time` is empty for most shows, so the latest episode stands in for it. */
function episodeRuntime(details: JsonRecord): number | null {
  const [listed] = Array.isArray(details.episode_run_time) ? details.episode_run_time : [];
  return (
    asNumber(listed) ||
    asNumber(asRecord(details.last_episode_to_air).runtime) ||
    asNumber(asRecord(details.next_episode_to_air).runtime) ||
    null
  );
}

function toShow(showId: number, details: JsonRecord): Show {
  const voteCount = asNumber(details.vote_count);
  return {
    id: showId,
    title: asText(details.name) ?? asText(details.original_name) ?? "",
    overview: asText(details.overview) ?? "",
    firstAirYear: yearOf(details.first_air_date),
    lastAirYear: yearOf(details.last_air_date),
    status: asText(details.status),
    seasonCount: asNumber(details.number_of_seasons),
    episodeCount: asNumber(details.number_of_episodes),
    networks: asRecords(details.networks).flatMap((network) => asText(network.name) ?? []),
    episodeRuntime: episodeRuntime(details),
    voteAverage: voteCount === 0 ? null : asNumber(details.vote_average),
    posterUrl: imageUrl("w780", details.poster_path),
    backdropUrl: imageUrl("w1280", details.backdrop_path),
    genres: asRecords(details.genres).flatMap((genre) => asText(genre.name) ?? []),
  };
}

export interface ShowRecord {
  show: Show;
  /** TMDB provider ids with any US offer, for filtering where `discover/tv` can't. */
  providerIds: number[];
  tvdbId: number | null;
}

function usProviderIds(details: JsonRecord): number[] {
  const region = asRecord(asRecord(details["watch/providers"]).results)[WATCH_REGION];
  const offers = OFFER_BUCKETS.flatMap((bucket) => asRecords(asRecord(region)[bucket]));
  return [...new Set(offers.flatMap((offer) => asNumber(offer.provider_id) ?? []))];
}

/** One call and one cache row for what the deck, filters and Plex all need. */
export function getShowRecord(showId: number): Promise<ShowRecord> {
  return cached("show", String(showId), DETAILS_TTL_SECONDS, async () => {
    const details = await tmdbGet(showPath(showId), {
      language: "en-US",
      append_to_response: "watch/providers,external_ids",
    });
    return {
      show: toShow(showId, details),
      providerIds: usProviderIds(details),
      tvdbId: asNumber(asRecord(details.external_ids).tvdb_id),
    };
  });
}

export async function getShow(showId: number): Promise<Show> {
  return (await getShowRecord(showId)).show;
}

export function hydrateShowRecords(showIds: readonly number[], stopAt?: number): Promise<ShowRecord[]> {
  return hydrateAll(showIds, getShowRecord, stopAt);
}

export async function hydrateShows(showIds: readonly number[], stopAt?: number): Promise<Show[]> {
  return (await hydrateShowRecords(showIds, stopAt)).map((record) => record.show);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Query parameters for `discover/tv`. It takes the language up front, unlike the
 * movie deck: Commitment Level already walks pages, so none go on foreign titles.
 * A show with nothing aired isn't one you can start, hence the default end date.
 * `cast` isn't here because `discover/tv` silently ignores `with_cast`.
 */
export function buildTvDiscoverQuery(filters: Filters, page: number): Record<string, string> {
  const query: Record<string, string> = {
    language: DECK_LANGUAGE,
    with_original_language: DECK_LANGUAGE,
    sort_by: "popularity.desc",
    include_adult: "false",
    page: String(page),
    "first_air_date.lte": filters.firstAirDateLte || today(),
  };
  if (filters.genreIds.length > 0) query.with_genres = filters.genreIds.join("|");
  const hidden = hiddenGenres(filters);
  if (hidden.length > 0) query.without_genres = hidden.join("|");
  const providerIds = providerIdsForServices(filters.services);
  if (providerIds.length > 0) {
    query.with_watch_providers = providerIds.join("|");
    query.watch_region = WATCH_REGION;
  }
  if (filters.firstAirDateGte) query["first_air_date.gte"] = filters.firstAirDateGte;
  if (filters.showStatus) query.with_status = SHOW_STATUSES[filters.showStatus].discover;
  return query;
}

export async function discoverShows(filters: Filters, page: number): Promise<DiscoverPage> {
  return toDiscoverPage(await tmdbGet("discover/tv", buildTvDiscoverQuery(filters, page)));
}

export function getTvGenres(): Promise<Genre[]> {
  return cached("genres", "tv", DETAILS_TTL_SECONDS, async () => {
    const body = await tmdbGet("genre/tv/list", { language: "en" });
    return asRecords(body.genres).flatMap((genre) => {
      const id = asNumber(genre.id);
      const name = asText(genre.name);
      return id !== null && name !== null ? [{ id, name }] : [];
    });
  });
}

export function getShowTrailerKey(showId: number): Promise<string | null> {
  return cached("trailer", mediaKey("TV", showId), DETAILS_TTL_SECONDS, async () => {
    const body = await tmdbGet(`${showPath(showId)}/videos`, { language: "en-US" });
    return pickTrailer(body.results);
  });
}

export async function getTmdbShowWatchProviders(showId: number): Promise<JsonRecord> {
  const body = await tmdbGet(`${showPath(showId)}/watch/providers`);
  return asRecord(asRecord(body.results)[WATCH_REGION]);
}

export interface ActorShow {
  id: number;
  genreIds: number[];
  firstAirDate: string | null;
  originalLanguage: string | null;
  hasPoster: boolean;
  popularity: number;
  episodeCount: number;
}

function toActorShow(credit: JsonRecord): ActorShow[] {
  const id = asNumber(credit.id);
  if (id === null || SELF_CREDIT.test(asText(credit.character) ?? "")) return [];
  return [
    {
      id,
      genreIds: Array.isArray(credit.genre_ids) ? credit.genre_ids.flatMap((genre) => asNumber(genre) ?? []) : [],
      firstAirDate: asText(credit.first_air_date),
      originalLanguage: asText(credit.original_language),
      hasPoster: asText(credit.poster_path) !== null,
      popularity: asNumber(credit.popularity) ?? 0,
      episodeCount: asNumber(credit.episode_count) ?? 0,
    },
  ];
}

/** Stands in for `with_cast`. An unknown person has no shows, which isn't worth failing a deck. */
export function getActorShows(personId: number): Promise<ActorShow[]> {
  return cached("tv-credits", String(personId), DAY_SECONDS, async () => {
    try {
      const body = await tmdbGet(`person/${personId}/tv_credits`, { language: "en-US" });
      return asRecords(body.cast).flatMap(toActorShow);
    } catch (error) {
      if (error instanceof NotFoundError) return [];
      throw error;
    }
  });
}

/** Plex Request knows shows by TVDB id. Null when TMDB has no show under it. */
export async function findShowByTvdbId(tvdbId: number): Promise<number | null> {
  const body = await tmdbGet(`find/${tvdbId}`, { external_source: "tvdb_id" });
  const [match] = asRecords(body.tv_results);
  return match ? asNumber(match.id) : null;
}

export interface LibraryShowDetails {
  genreIds: number[];
  castIds: number[];
  firstAirDate: string | null;
  popularity: number;
  status: string | null;
  seasonCount: number | null;
}

/** What the library index keeps. Uncached: the job only asks once per title. */
export async function getLibraryShowDetails(showId: number): Promise<LibraryShowDetails> {
  const details = await tmdbGet(showPath(showId), {
    language: "en-US",
    append_to_response: "aggregate_credits",
  });
  return {
    genreIds: asRecords(details.genres).flatMap((genre) => asNumber(genre.id) ?? []),
    // Aggregate, because `credits` is only the latest season's cast.
    castIds: asRecords(asRecord(details.aggregate_credits).cast)
      .slice(0, INDEXED_CAST)
      .flatMap((person) => asNumber(person.id) ?? []),
    firstAirDate: asText(details.first_air_date),
    popularity: asNumber(details.popularity) ?? 0,
    status: asText(details.status),
    seasonCount: asNumber(details.number_of_seasons),
  };
}
