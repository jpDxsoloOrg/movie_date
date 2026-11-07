import type { FieldArguments, Room } from "@movie-date/core";
import { isConditionFailure } from "../lib/db.js";
import { publishRoomEvent } from "../lib/events.js";
import type { ResolverContext } from "../lib/identity.js";
import { getOrCreateProfile, loadRoom, updateRoomMeta } from "../lib/rooms.js";

export async function startNewRound(
  args: FieldArguments["startNewRound"],
  context: ResolverContext,
): Promise<Room> {
  const { userId } = context;
  const { roomId } = await getOrCreateProfile(context);
  try {
    const updated = await updateRoomMeta(roomId, {
      updateExpression: "SET #round = #round + :one",
      names: { "#round": "round" },
      values: { ":one": 1, ":expected": args.expectedRound },
      conditionExpression: "#round = :expected",
    });
    await publishRoomEvent({
      roomId,
      type: "ROUND_RESET",
      round: updated?.round ?? args.expectedRound + 1,
      actorId: userId,
    });
  } catch (error) {
    // Someone else pressed first: not an error, the caller just goes home.
    if (!isConditionFailure(error)) throw error;
  }
  return loadRoom(roomId, userId);
}
