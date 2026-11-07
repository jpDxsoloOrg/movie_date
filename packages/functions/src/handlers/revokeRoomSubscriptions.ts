import type { FieldArguments } from "@movie-date/core";
import type { ResolverContext } from "../lib/identity.js";

/**
 * sst.config.ts routes this field to a NONE data source, because only a resolver can
 * invalidate subscriptions. This is here for the handler table, as publishRoomEvent is.
 */
export async function revokeRoomSubscriptions(
  _args: FieldArguments["revokeRoomSubscriptions"],
  _context: ResolverContext,
): Promise<boolean> {
  return false;
}
