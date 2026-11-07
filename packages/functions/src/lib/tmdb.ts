import { buildDiscoverQuery, type Filters, type Genre, type Movie, type Person } from "@movie-date/core";
import { cached, DAY_SECONDS } from "./cache.js";
import { AppError, NotFoundError, UpstreamError, ValidationError } from "./errors.js";
import { getTmdbKey } from "./secrets.js";

const API_BASE = "https://api.themoviedb.org/3";
const IMAGE_BASE = "https://image.tmdb.org/t/p";
const REQUEST_TIMEOUT_MS = 5_000;
const DETAILS_TTL_SECONDS = 7 * DAY_SECONDS;
/** TMDB allows far more, but a deck page shouldn't monopolise the Lambda's sockets. */
const HYDRATE_CONCURRENCY = 6;

export type JsonRecord = Record<string, unknown>;

export function asRecord(value: unknown): JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

export function asRecords(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

/** TMDB sends both null and "" for missing text, so both become null. */
export function asText(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function imageUrl(size: string, path: unknown): string | null {
  const text = asText(path);
  return text ? `${IMAGE_BASE}/${size}${text}` : null;
}

/**
 * The only way out to third parties. Errors are rebuilt rather than passed on
 * because the original can carry the request URL, and TMDB's key is in the query
 * string; the resolver logs whatever it is handed.
 */
export async function fetchJson(
  url: URL,
  label: string,
  headers: Record<string, string> = {},
): Promise<unknown> {
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status === 404) throw new NotFoundError();
    if (!response.ok) {
      console.error(`${label} responded ${response.status}`);
      throw new UpstreamError();
    }
    const body: unknown = await response.json();
    return body;
  } catch (error) {
    if (error instanceof AppError) throw error;
    console.error(`${label} request failed`, error instanceof Error ? error.name : "unknown");
    throw new UpstreamError();
  }
}

async function tmdbGet(path: string, query: Record<string, string> = {}): Promise<JsonRecord> {
  const url = new URL(`${API_BASE}/${path}`);
  url.search = new URLSearchParams({ ...query, api_key: await getTmdbKey() }).toString();
  return asRecord(await fetchJson(url, `TMDB ${path}`));
}

function moviePath(movieId: number): string {
  if (!Number.isInteger(movieId) || movieId < 1) throw new ValidationError("Invalid movie id.");
  return `movie/${movieId}`;
}

function releaseYear(releaseDate: unknown): number | null {
  const year = /^\d{4}/.exec(asText(releaseDate) ?? "");
  return year ? Number(year[0]) : null;
}

function toMovie(movieId: number, details: JsonRecord): Movie {
  const voteCount = asNumber(details.vote_count);
  return {
    id: movieId,
    title: asText(details.title) ?? asText(details.original_title) ?? "",
    overview: asText(details.overview) ?? "",
    releaseYear: releaseYear(details.release_date),
    // TMDB uses 0 for "unknown" here, and a 0 rating on no votes isn't a rating.
    runtime: asNumber(details.runtime) || null,
    voteAverage: voteCount === 0 ? null : asNumber(details.vote_average),
    posterUrl: imageUrl("w780", details.poster_path),
    backdropUrl: imageUrl("w1280", details.backdrop_path),
    genres: asRecords(details.genres).flatMap((genre) => asText(genre.name) ?? []),
  };
}

export function getMovie(movieId: number): Promise<Movie> {
  return cached("movie", String(movieId), DETAILS_TTL_SECONDS, async () =>
    toMovie(movieId, await tmdbGet(moviePath(movieId), { language: "en-US" })),
  );
}

/**
 * Details for many movies at once, in the order given. One bad title is dropped
 * so it can't cost the whole deck, but if nothing loads at all the failure is
 * rethrown: otherwise an outage would look like the end of the deck.
 */
export async function hydrateMovies(movieIds: readonly number[]): Promise<Movie[]> {
  const movies = new Array<Movie | undefined>(movieIds.length);
  let outage: unknown;
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < movieIds.length) {
      const index = cursor;
      cursor += 1;
      try {
        movies[index] = await getMovie(movieIds[index] as number);
      } catch (error) {
        if (!(error instanceof NotFoundError)) outage ??= error;
      }
    }
  }

  const workerCount = Math.min(HYDRATE_CONCURRENCY, movieIds.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  const loaded = movies.filter((movie) => movie !== undefined);
  if (loaded.length === 0 && outage !== undefined) throw outage;
  return loaded;
}

export interface DiscoverResult {
  id: number;
  originalLanguage: string | null;
  hasPoster: boolean;
}

export interface DiscoverPage {
  results: DiscoverResult[];
  totalPages: number;
}

export async function discoverMovies(filters: Filters, page: number): Promise<DiscoverPage> {
  const body = await tmdbGet("discover/movie", buildDiscoverQuery(filters, page));
  const results = asRecords(body.results).flatMap((result) => {
    const id = asNumber(result.id);
    if (id === null) return [];
    return [
      {
        id,
        originalLanguage: asText(result.original_language),
        hasPoster: asText(result.poster_path) !== null,
      },
    ];
  });
  return { results, totalPages: asNumber(body.total_pages) ?? 0 };
}

export function getGenres(): Promise<Genre[]> {
  return cached("genres", "movie", DETAILS_TTL_SECONDS, async () => {
    const body = await tmdbGet("genre/movie/list", { language: "en" });
    return asRecords(body.genres).flatMap((genre) => {
      const id = asNumber(genre.id);
      const name = asText(genre.name);
      return id !== null && name !== null ? [{ id, name }] : [];
    });
  });
}

export async function searchPeople(query: string): Promise<Person[]> {
  const body = await tmdbGet("search/person", {
    query,
    include_adult: "false",
    language: "en",
    page: "1",
  });
  return asRecords(body.results).flatMap((person) => {
    const id = asNumber(person.id);
    const name = asText(person.name);
    if (id === null || name === null) return [];
    return [
      {
        id,
        name,
        profileUrl: imageUrl("w185", person.profile_path),
        knownForDepartment: asText(person.known_for_department),
      },
    ];
  });
}

/** Only YouTube counts, because that's the one player the site embeds. */
function pickTrailer(videos: unknown): string | null {
  const youtube = asRecords(videos).filter(
    (video) => video.site === "YouTube" && asText(video.key) !== null,
  );
  const best =
    youtube.find((video) => video.type === "Trailer" && video.official === true) ??
    youtube.find((video) => video.type === "Trailer") ??
    youtube.find((video) => video.type === "Teaser");
  return best ? asText(best.key) : null;
}

export function getTrailerKey(movieId: number): Promise<string | null> {
  return cached("trailer", String(movieId), DETAILS_TTL_SECONDS, async () => {
    const body = await tmdbGet(`${moviePath(movieId)}/videos`, { language: "en-US" });
    return pickTrailer(body.results);
  });
}

export async function getTmdbWatchProviders(movieId: number): Promise<JsonRecord> {
  const body = await tmdbGet(`${moviePath(movieId)}/watch/providers`);
  return asRecord(asRecord(body.results).US);
}
