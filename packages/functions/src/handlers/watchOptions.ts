import type { FieldArguments, WatchOption } from "@movie-date/core";
import { getWatchOptions } from "../lib/watch.js";

export function watchOptions({
  movieId,
}: FieldArguments["watchOptions"]): Promise<WatchOption[]> {
  return getWatchOptions(movieId);
}
