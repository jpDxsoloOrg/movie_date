import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import type { Filters } from "@movie-date/core";
import { getS3Client } from "./avatars.js";

/** Shows get their own object beside this one, since TMDB ids overlap across types. */
const MOVIES_OBJECT = "movies.json";

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

let remembered: { index: LibraryIndex; readAt: number } | undefined;

function indexBucket(): string {
  const bucket = process.env.PLEX_INDEX_BUCKET;
  if (!bucket) throw new Error("PLEX_INDEX_BUCKET is not set");
  return bucket;
}

/** Null only when no index exists yet. Any other failure throws, so the job can't mistake it for that. */
export async function readLibraryIndex(): Promise<LibraryIndex | null> {
  try {
    const { Body } = await getS3Client().send(
      new GetObjectCommand({ Bucket: indexBucket(), Key: MOVIES_OBJECT }),
    );
    const stored = JSON.parse((await Body?.transformToString()) ?? "") as LibraryIndex;
    if (!Array.isArray(stored.movies)) throw new Error("Malformed library index");
    return stored;
  } catch (error) {
    if (error instanceof Error && error.name === "NoSuchKey") return null;
    throw error;
  }
}

/** One PUT replaces the object whole, so readers see the last good index or the new one. */
export async function saveLibraryIndex(movies: LibraryMovie[]): Promise<void> {
  const index: LibraryIndex = { generatedAt: new Date().toISOString(), movies };
  await getS3Client().send(
    new PutObjectCommand({
      Bucket: indexBucket(),
      Key: MOVIES_OBJECT,
      Body: JSON.stringify(index),
      ContentType: "application/json",
    }),
  );
}

/** Null when there's nothing usable. A read failure serves the last copy this Lambda saw. */
export async function loadLibraryIndex(): Promise<LibraryIndex | null> {
  if (remembered && Date.now() - remembered.readAt < MEMORY_TTL_MS) return remembered.index;
  try {
    const index = await readLibraryIndex();
    remembered = index ? { index, readAt: Date.now() } : undefined;
    return index;
  } catch (error) {
    console.warn("Library index unavailable", error instanceof Error ? error.name : "unknown");
    return remembered?.index ?? null;
  }
}

export async function hasFileOnPlex(movieId: number): Promise<boolean> {
  const index = await loadLibraryIndex();
  return index?.movies.some((movie) => movie.id === movieId && movie.hasFile) ?? false;
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
