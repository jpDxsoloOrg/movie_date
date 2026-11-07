import type { FieldArguments, FilterPreview } from "@movie-date/core";
import { getItem, type Item } from "../lib/db.js";
import { deckSource } from "../lib/deckSource.js";
import { checkedFilters } from "../lib/filters.js";
import type { ResolverContext } from "../lib/identity.js";
import { profile } from "../lib/keys.js";
import { hydrateMovies } from "../lib/tmdb.js";

/** The widest preview strip shows five. */
const PREVIEW_POSTERS = 5;
/** Library titles can lack a poster, so a few spares keep the strip full. */
const POSTER_CANDIDATES = 8;

interface ProfileRow extends Item {
  roomId?: string;
}

/** Doesn't leave out what the caller has swiped: it answers for the filters, not the deck. */
export async function filterPreview(
  args: FieldArguments["filterPreview"],
  { userId }: ResolverContext,
): Promise<FilterPreview> {
  const filters = checkedFilters(args.filters);
  const caller = await getItem<ProfileRow>(profile(userId));
  const source = await deckSource(caller?.roomId ?? null, filters);
  const { ids, totalResults } = await source(1);
  const movies = await hydrateMovies(ids.slice(0, POSTER_CANDIDATES));
  return {
    totalResults,
    posterUrls: movies.flatMap((movie) => movie.posterUrl ?? []).slice(0, PREVIEW_POSTERS),
  };
}
