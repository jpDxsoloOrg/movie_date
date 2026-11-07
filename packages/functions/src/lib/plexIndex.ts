import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Filters } from "@movie-date/core";
import { getS3Client } from "./avatars.js";
import { inFirstAirRange, matchesCommitment, matchesStatus } from "./showFilters.js";

/** Two objects, since TMDB ids overlap across types. */
const MOVIES_OBJECT = "movies.json";
const SHOWS_OBJECT = "shows.json";

/** A warm Lambda rereads at this pace; the index itself only changes every 6 hours. */
const MEMORY_TTL_MS = 5 * 60_000;

export interface LibraryMovie {
  id: number;
  genreIds: number[];
  castIds: number[];
  /** YYYY-MM-DD, or null when TMDB has none. */
  releaseDate: string | null;
  popularity: number;
  hasFile: boolean;
}

export interface LibraryIndex {
  generatedAt: string;
  movies: LibraryMovie[];
}

export interface LibraryShow {
  /** TMDB's id, which is what the deck deals. */
  id: number;
  /** Plex Request's id, kept so the job needn't convert a show twice. */
  tvdbId: number;
  genreIds: number[];
  castIds: number[];
  firstAirDate: string | null;
  popularity: number;
  status: string | null;
  seasonCount: number | null;
  hasFile: boolean;
}

export interface ShowIndex {
  generatedAt: string;
  shows: LibraryShow[];
}

function indexBucket(): string {
  const bucket = process.env.PLEX_INDEX_BUCKET;
  if (!bucket) throw new Error("PLEX_INDEX_BUCKET is not set");
  return bucket;
}

async function readObject<T>(key: string, isValid: (stored: T) => boolean): Promise<T | null> {
  try {
    const { Body } = await getS3Client().send(new GetObjectCommand({ Bucket: indexBucket(), Key: key }));
    const stored = JSON.parse((await Body?.transformToString()) ?? "") as T;
    if (!isValid(stored)) throw new Error("Malformed library index");
    return stored;
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") return null;
    throw error;
  }
}

/** One PUT replaces the object whole, so readers see the last good index or the new one. */
async function saveObject(key: string, index: LibraryIndex | ShowIndex): Promise<void> {
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: indexBucket(),
      Key: key,
      Body: JSON.stringify(index),
      ContentType: "application/json",
    }),
  );
}

/** Null only when no index exists yet. Any other failure throws, so the job can't mistake it for that. */
export function readLibraryIndex(): Promise<LibraryIndex | null> {
  return readObject<LibraryIndex>(MOVIES_OBJECT, (stored) => Array.isArray(stored.movies));
}

export function readShowIndex(): Promise<ShowIndex | null> {
  return readObject<ShowIndex>(SHOWS_OBJECT, (stored) => Array.isArray(stored.shows));
}

export async function saveLibraryIndex(movies: LibraryMovie[]): Promise<void> {
  await saveObject(MOVIES_OBJECT, { generatedAt: new Date().toISOString(), movies });
}

export async function saveShowIndex(shows: LibraryShow[]): Promise<void> {
  await saveObject(SHOWS_OBJECT, { generatedAt: new Date().toISOString(), shows });
}

/** Null when there's nothing usable. A read failure serves the last copy this Lambda saw. */
function remembering<T>(read: () => Promise<T | null>): () => Promise<T | null> {
  let remembered: { index: T; readAt: number } | undefined;
  return async () => {
    if (remembered && Date.now() - remembered.readAt < MEMORY_TTL_MS) return remembered.index;
    try {
      const index = await read();
      remembered = index ? { index, readAt: Date.now() } : undefined;
      return index;
    } catch (error) {
      console.warn("Library index unavailable", error instanceof Error ? error.name : "unknown");
      return remembered?.index ?? null;
    }
  };
}

export const loadLibraryIndex = remembering(readLibraryIndex);
export const loadShowIndex = remembering(readShowIndex);

export async function hasFileOnPlex(movieId: number): Promise<boolean> {
  const index = await loadLibraryIndex();
  return index?.movies.some((movie) => movie.id === movieId && movie.hasFile) ?? false;
}

/**
 * Plex Request's sync writes hasFile false for every series, so until that's fixed
 * a false says nothing and being in the library is the best signal there is. The
 * first true in the index means the flag works, and it's then believed.
 */
export function watchableShows(index: ShowIndex): LibraryShow[] {
  const withFiles = index.shows.filter((show) => show.hasFile);
  return withFiles.length > 0 ? withFiles : index.shows;
}

export type ShowPresence = "WATCHABLE" | "WAITING" | "ABSENT";

export async function showPresence(showId: number): Promise<ShowPresence> {
  const index = await loadShowIndex();
  if (!index?.shows.some((show) => show.id === showId)) return "ABSENT";
  return watchableShows(index).some((show) => show.id === showId) ? "WATCHABLE" : "WAITING";
}

function matchesFilters(movie: LibraryMovie, filters: Filters): boolean {
  const { genreIds, cast, releaseDateGte, releaseDateLte } = filters;
  if (genreIds.length > 0 && !genreIds.some((id) => movie.genreIds.includes(id))) return false;
  if (cast.length > 0 && !cast.some((person) => movie.castIds.includes(person.id))) return false;
  if (!releaseDateGte && !releaseDateLte) return true;
  if (!movie.releaseDate) return false;
  if (releaseDateGte && movie.releaseDate < releaseDateGte) return false;
  return !releaseDateLte || movie.releaseDate <= releaseDateLte;
}

/** Id breaks ties so a page holds the same titles from one request to the next. */
export function matchingMovies(index: LibraryIndex, filters: Filters): LibraryMovie[] {
  return index.movies
    .filter((movie) => movie.hasFile && matchesFilters(movie, filters))
    .sort((first, second) => second.popularity - first.popularity || first.id - second.id);
}

function showMatchesFilters(show: LibraryShow, filters: Filters): boolean {
  const { genreIds, cast, showStatus, commitment } = filters;
  if (genreIds.length > 0 && !genreIds.some((id) => show.genreIds.includes(id))) return false;
  if (cast.length > 0 && !cast.some((person) => show.castIds.includes(person.id))) return false;
  return (
    inFirstAirRange(show.firstAirDate, filters) &&
    matchesStatus(show.status, showStatus) &&
    matchesCommitment(show.seasonCount, commitment)
  );
}

export function matchingShows(index: ShowIndex, filters: Filters): LibraryShow[] {
  return watchableShows(index)
    .filter((show) => showMatchesFilters(show, filters))
    .sort((first, second) => second.popularity - first.popularity || first.id - second.id);
}
