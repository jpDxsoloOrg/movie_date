import { findProvider, PLEX_SERVICE, type FieldArguments, type WatchOption } from "@movie-date/core";
import type { ResolverContext } from "../lib/identity.js";
import { hasFileOnPlex } from "../lib/plexIndex.js";
import { getOrCreateProfile, isPlexAvailable } from "../lib/rooms.js";
import { getWatchOptions } from "../lib/watch.js";

const PLEX_OPTION: WatchOption = {
  serviceId: PLEX_SERVICE,
  serviceName: findProvider(PLEX_SERVICE)?.label ?? "Plex",
  type: "library",
  link: null,
  logoUrl: null,
};

/** The extra entry is a bonus, so nothing in here may cost the caller the real list. */
async function roomHasOnPlex(movieId: number, context: ResolverContext): Promise<boolean> {
  try {
    if (!(await hasFileOnPlex(movieId))) return false;
    const { roomId } = await getOrCreateProfile(context);
    return await isPlexAvailable(roomId);
  } catch (error) {
    console.warn("Plex watch option skipped", error instanceof Error ? error.name : "unknown");
    return false;
  }
}

/** Added here, not in the cache: that's shared by every room and this differs per room. */
export async function watchOptions(
  { movieId }: FieldArguments["watchOptions"],
  context: ResolverContext,
): Promise<WatchOption[]> {
  const [options, onPlex] = await Promise.all([
    getWatchOptions(movieId, context.userId),
    roomHasOnPlex(movieId, context),
  ]);
  return onPlex ? [PLEX_OPTION, ...options] : options;
}
