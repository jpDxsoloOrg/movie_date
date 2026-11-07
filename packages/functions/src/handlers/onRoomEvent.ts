import type { FieldArguments } from "@movie-date/core";
import { getItem } from "../lib/db.js";
import { ForbiddenError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import type { ProfileItem } from "../lib/rooms.js";

/** Returning null lets the subscription through; throwing rejects it. */
export async function onRoomEvent(
  args: FieldArguments["onRoomEvent"],
  context: ResolverContext,
): Promise<null> {
  // Consistent because clients resubscribe the moment a join returns.
  const profile = await getItem<ProfileItem>(keys.profile(context.userId), { consistent: true });
  if (profile?.roomId !== args.roomId) throw new ForbiddenError();
  return null;
}
