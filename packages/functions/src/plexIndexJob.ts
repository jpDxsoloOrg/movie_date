import type { Context } from "aws-lambda";
import { deleteItem } from "./lib/db.js";
import { plexIndexLease } from "./lib/keys.js";
import { claimInterval } from "./lib/limits.js";
import { readLibraryIndex, saveLibraryIndex, type LibraryMovie } from "./lib/plexIndex.js";
import { libraryMovies, type LibraryEntry } from "./lib/plexRequest.js";
import { getLibraryDetails } from "./lib/tmdb.js";

/** The first run fetches the whole library, and this must leave TMDB room for the deck. */
const TMDB_CONCURRENCY = 4;
/** What's left to save the work done so far. The next run picks up the rest. */
const STOP_MARGIN_MS = 60_000;
/**
 * Outlives the function's 15 minute timeout so a crashed run can't block the next
 * one for good. A lease rather than reserved concurrency: the account's limit of 10
 * is also the minimum Lambda keeps unreserved, so it has nothing to reserve.
 */
const LEASE_SECONDS = 20 * 60;

export interface IndexJobResult {
  skipped: boolean;
  total: number;
  added: number;
  failed: number;
}

type TimeLeft = Pick<Context, "getRemainingTimeInMillis">;

async function fetchMissing(
  entries: readonly LibraryEntry[],
  context: TimeLeft,
): Promise<LibraryMovie[]> {
  const movies: LibraryMovie[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < entries.length && context.getRemainingTimeInMillis() > STOP_MARGIN_MS) {
      const entry = entries[cursor] as LibraryEntry;
      cursor += 1;
      try {
        const details = await getLibraryDetails(entry.tmdbId);
        movies.push({ id: entry.tmdbId, hasFile: entry.hasFile, ...details });
      } catch (error) {
        console.warn(`Skipped ${entry.tmdbId}`, error instanceof Error ? error.name : "unknown");
      }
    }
  }

  await Promise.all(Array.from({ length: TMDB_CONCURRENCY }, worker));
  return movies;
}

async function refreshIndex(context: TimeLeft): Promise<IndexJobResult> {
  // Both throw on failure, which leaves the stored index untouched.
  const library = new Map((await libraryMovies()).map((entry) => [entry.tmdbId, entry]));
  const previous = await readLibraryIndex();
  const known = new Map(previous?.movies.map((movie) => [movie.id, movie]));

  // An empty answer from a library with titles in it is an outage until proven otherwise.
  if (library.size === 0 && known.size > 0) {
    throw new Error("Plex Request reported an empty library");
  }

  const kept: LibraryMovie[] = [];
  const missing: LibraryEntry[] = [];
  for (const entry of library.values()) {
    const movie = known.get(entry.tmdbId);
    if (movie) kept.push({ ...movie, hasFile: entry.hasFile });
    else missing.push(entry);
  }
  const added = await fetchMissing(missing, context);
  const movies = [...kept, ...added];
  if (movies.length > 0) await saveLibraryIndex(movies);
  return {
    skipped: false,
    total: movies.length,
    added: added.length,
    failed: missing.length - added.length,
  };
}

/** One sequential run, whether from the schedule or invoked by hand. */
export async function handler(_event: unknown, context: TimeLeft): Promise<IndexJobResult> {
  const lease = plexIndexLease();
  if (!(await claimInterval(lease, LEASE_SECONDS))) {
    return { skipped: true, total: 0, added: 0, failed: 0 };
  }
  try {
    const result = await refreshIndex(context);
    console.log("Library index refreshed", result);
    return result;
  } finally {
    await deleteItem(lease);
  }
}
