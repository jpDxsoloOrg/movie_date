import {
  resolveMediaType,
  type FieldArguments,
  type FilterPreview,
  type Filters,
} from "@movie-date/core";
import { getItem, type Item } from "../lib/db.js";
import { deckSource } from "../lib/deckSource.js";
import { checkedFilters } from "../lib/filters.js";
import type { ResolverContext } from "../lib/identity.js";
import { profile } from "../lib/keys.js";
import { matchesShowFilters } from "../lib/showFilters.js";
import { hydrateMovies } from "../lib/tmdb.js";
import { hydrateShows } from "../lib/tmdbTv.js";
import { takePreviewUnit, withShowPreviewPermit } from "../lib/walkLimits.js";

/** The widest preview strip shows five. */
const PREVIEW_POSTERS = 5;
/** Library titles can lack a poster, so a few spares keep the strip full. */
const POSTER_CANDIDATES = 8;
/** It runs on every filter change, so a rare combination gets fewer posters, not a long wait. */
const SHOW_PREVIEW_PAGES = 3;
const SHOW_PREVIEW_BUDGET_MS = 10_000;

interface ProfileRow extends Item {
  roomId?: string;
}

async function moviePreview(roomId: string | null, filters: Filters): Promise<FilterPreview> {
  const source = await deckSource(roomId, filters);
  const { ids, totalResults } = await source(1);
  const movies = await hydrateMovies(ids.slice(0, POSTER_CANDIDATES));
  return {
    totalResults,
    posterUrls: movies.flatMap((movie) => movie.posterUrl ?? []).slice(0, PREVIEW_POSTERS),
  };
}

/**
 * Commitment Level is only known show by show, so with it set the count would
 * promise titles the deck won't deal, and there's no honest total to give.
 */
async function showPreview(roomId: string | null, filters: Filters): Promise<FilterPreview> {
  const stopAt = Date.now() + SHOW_PREVIEW_BUDGET_MS;
  const source = await deckSource(roomId, filters, { mediaType: "TV", stopAt });
  const posterUrls: string[] = [];
  let count: number | null = null;
  for (let page = 1; page <= SHOW_PREVIEW_PAGES; page += 1) {
    const { ids, totalPages, totalResults } = await source(page);
    if (page === 1) count = totalResults;
    const candidates = filters.commitment ? ids : ids.slice(0, POSTER_CANDIDATES);
    const shows = await hydrateShows(candidates, stopAt);
    posterUrls.push(
      ...shows.filter((show) => matchesShowFilters(show, filters)).flatMap((show) => show.posterUrl ?? []),
    );
    if (posterUrls.length >= PREVIEW_POSTERS || page >= totalPages || Date.now() >= stopAt) break;
  }
  return {
    totalResults: filters.commitment ? null : count,
    posterUrls: posterUrls.slice(0, PREVIEW_POSTERS),
  };
}

/** Doesn't leave out what the caller has swiped: it answers for the filters, not the deck. */
export async function filterPreview(
  args: FieldArguments["filterPreview"],
  { userId }: ResolverContext,
): Promise<FilterPreview> {
  const mediaType = resolveMediaType(args.mediaType);
  const filters = checkedFilters(args.filters, mediaType);
  await takePreviewUnit(userId);
  const caller = await getItem<ProfileRow>(profile(userId));
  const roomId = caller?.roomId ?? null;
  return mediaType === "TV"
    ? withShowPreviewPermit(() => showPreview(roomId, filters))
    : moviePreview(roomId, filters);
}
