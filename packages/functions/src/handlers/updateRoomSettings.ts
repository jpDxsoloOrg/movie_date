import { effectiveThreshold, type FieldArguments, type Room } from "@movie-date/core";
import { publishRoomEvent } from "../lib/events.js";
import type { ResolverContext } from "../lib/identity.js";
import { settleRoom } from "../lib/matching.js";
import { getOrCreateProfile, loadMemberRows, loadRoom, updateRoomMeta } from "../lib/rooms.js";

export async function updateRoomSettings(
  args: FieldArguments["updateRoomSettings"],
  context: ResolverContext,
): Promise<Room> {
  const { userId } = context;
  const { requireMajority } = args;
  const { roomId } = await getOrCreateProfile(context);
  const memberRows = await loadMemberRows(roomId);
  const matchThreshold = effectiveThreshold(
    { matchThreshold: args.matchThreshold, requireMajority },
    memberRows.length,
  );

  // Must precede the re-evaluation: see evaluateMovie for the ordering this forms.
  await updateRoomMeta(roomId, {
    updateExpression: "SET matchThreshold = :matchThreshold, requireMajority = :requireMajority",
    values: { ":matchThreshold": matchThreshold, ":requireMajority": requireMajority },
    conditionExpression: "attribute_exists(pk)",
  });
  await publishRoomEvent({ roomId, type: "ROOM_UPDATED", actorId: userId });
  await settleRoom(roomId, userId);
  return loadRoom(roomId, userId);
}
