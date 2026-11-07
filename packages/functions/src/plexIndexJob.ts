import type { Context } from "aws-lambda";
import { deleteItem } from "./lib/db.js";
import { plexIndexLease } from "./lib/keys.js";
import { claimInterval } from "./lib/limits.js";
import {
  readLibraryIndex,
  readShowIndex,
  saveLibraryIndex,
  saveShowIndex,
  type LibraryMovie,
  type LibraryShow,
} from "./lib/plexIndex.js";
import {
  libraryMovies,
  libraryShows,
  type LibraryEntry,
  type ShowLibraryEntry,
} from "./lib/plexRequest.js";
import { getLibraryDetails } from "./lib/tmdb.js";
import { findShowByTvdbId, getLibraryShowDetails } from "./lib/tmdbTv.js";

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

interface IndexCounts {
  total: number;
  added: number;
  failed: number;
}

export interface IndexJobResult extends IndexCounts {
  skipped: boolean;
  /** Null when the show pass didn't change the stored index. */
  shows: IndexCounts | null;
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

async function refreshIndex(context: TimeLeft): Promise<IndexCounts> {
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
    total: movies.length,
    added: added.length,
    failed: missing.length - added.length,
  };
}

async function fetchMissingShows(
  entries: readonly ShowLibraryEntry[],
  context: TimeLeft,
): Promise<LibraryShow[]> {
  const shows: LibraryShow[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < entries.length && context.getRemainingTimeInMillis() > STOP_MARGIN_MS) {
      const entry = entries[cursor] as ShowLibraryEntry;
      cursor += 1;
      try {
        const id = await findShowByTvdbId(entry.tvdbId);
        if (id === null) {
          console.warn(`No TMDB show for TVDB ${entry.tvdbId}`);
          continue;
        }
        const details = await getLibraryShowDetails(id);
        shows.push({ id, tvdbId: entry.tvdbId, hasFile: entry.hasFile, ...details });
      } catch (error) {
        console.warn(`Skipped TVDB ${entry.tvdbId}`, error instanceof Error ? error.name : "unknown");
      }
    }
  }

  await Promise.all(Array.from({ length: TMDB_CONCURRENCY }, worker));
  return shows;
}

async function refreshShows(context: TimeLeft): Promise<IndexCounts | null> {
  const library = new Map((await libraryShows()).map((entry) => [entry.tvdbId, entry]));
  // Also how an integration without the op reads, so an empty answer changes nothing.
  if (library.size === 0) return null;
  const previous = await readShowIndex();
  const known = new Map(previous?.shows.map((show) => [show.tvdbId, show]));

  const kept: LibraryShow[] = [];
  const missing: ShowLibraryEntry[] = [];
  for (const entry of library.values()) {
    const show = known.get(entry.tvdbId);
    if (show) kept.push({ ...show, hasFile: entry.hasFile });
    else missing.push(entry);
  }
  const added = await fetchMissingShows(missing, context);
  // Two TVDB entries can land on one TMDB show, and the deck deals by TMDB id.
  const shows = [...new Map([...kept, ...added].map((show) => [show.id, show])).values()];
  if (shows.length > 0) await saveShowIndex(shows);
  return { total: shows.length, added: added.length, failed: missing.length - added.length };
}

/** Shows are the newer half of the index, so their failing mustn't cost a run of movies. */
async function refreshShowsSafely(context: TimeLeft): Promise<IndexCounts | null> {
  try {
    return await refreshShows(context);
  } catch (error) {
    console.error("Show index refresh failed", error instanceof Error ? error.name : "unknown");
    return null;
  }
}

/** One sequential run, whether from the schedule or invoked by hand. */
export async function handler(_event: unknown, context: TimeLeft): Promise<IndexJobResult> {
  const lease = plexIndexLease();
  if (!(await claimInterval(lease, LEASE_SECONDS))) {
    return { skipped: true, total: 0, added: 0, failed: 0, shows: null };
  }
  try {
    const movies = await refreshIndex(context);
    const result = { skipped: false, ...movies, shows: await refreshShowsSafely(context) };
    console.log("Library index refreshed", result);
    return result;
  } finally {
    await deleteItem(lease);
  }
}
