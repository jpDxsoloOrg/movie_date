import type { FieldArguments, WatchOption } from "@movie-date/core";
import type { ResolverContext } from "../lib/identity.js";
import { getWatchOptions } from "../lib/watch.js";

export function watchOptions(
  { movieId }: FieldArguments["watchOptions"],
  context: ResolverContext,
): Promise<WatchOption[]> {
  return getWatchOptions(movieId, context.userId);
}
