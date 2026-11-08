import { resolveMediaType, type FieldArguments, type Room } from "@movie-date/core";
import { ValidationError } from "../lib/errors.js";
import { publishRoomEvent } from "../lib/events.js";
import { markHistoryCleared } from "../lib/history.js";
import type { ResolverContext } from "../lib/identity.js";
import { roundAttribute, roundOf } from "../lib/mediaMode.js";
import { FIRST_ROUND, getOrCreateProfile, loadMemberRows, loadRoom, updateRoomMeta } from "../lib/rooms.js";

/**
 * Lets someone alone in a room take back every Watch and Don't Watch without leaving.
 * It's the mode's Back to Start plus an emptied swipe list. With anyone else in the room
 * it would throw away their round too, so it's refused.
 */
export async function resetSwipes(args: FieldArguments["resetSwipes"], context: ResolverContext): Promise<Room> {
  const mediaType = resolveMediaType(args.mediaType);
  const { userId } = context;
  const { roomId } = await getOrCreateProfile(context);
  const members = await loadMemberRows(roomId);
  if (members.length !== 1) {
    throw new ValidationError("You can only reset your swipes when you're the only one in the room.");
  }

  const updated = await updateRoomMeta(roomId, {
    updateExpression: "SET #round = if_not_exists(#round, :first) + :one",
    names: { "#round": roundAttribute(mediaType) },
    values: { ":one": 1, ":first": FIRST_ROUND },
    conditionExpression: "attribute_exists(pk)",
  });
  await markHistoryCleared(roomId, userId, "SWIPES", mediaType);
  // The caller's other devices restart their deck, as they would for Back to Start.
  if (updated) {
    await publishRoomEvent({ roomId, type: "ROUND_RESET", mediaType, round: roundOf(updated, mediaType), actorId: userId });
  }
  return loadRoom(roomId, userId);
}
