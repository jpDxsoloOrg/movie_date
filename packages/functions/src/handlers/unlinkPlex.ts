import type { FieldArguments, Profile } from "@movie-date/core";
import { deleteItem, updateItem } from "../lib/db.js";
import { publishRoomEvent } from "../lib/events.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { getOrCreateProfile, toProfile, type ProfileItem } from "../lib/rooms.js";

export async function unlinkPlex(
  _args: FieldArguments["unlinkPlex"],
  context: ResolverContext,
): Promise<Profile> {
  const { userId } = context;
  const profile = await getOrCreateProfile(context);
  // A code still in the post mustn't relink an account its owner just unlinked.
  await deleteItem(keys.plexLink(userId));
  if (!profile.plexUserId) return toProfile(profile, userId);

  const updated = await updateItem<ProfileItem>(keys.profile(userId), {
    updateExpression: "REMOVE plexUserId, plexEmail",
    conditionExpression: "attribute_exists(pk)",
  });
  await publishRoomEvent({ roomId: profile.roomId, type: "ROOM_UPDATED", actorId: userId });
  return toProfile(updated ?? profile, userId);
}
