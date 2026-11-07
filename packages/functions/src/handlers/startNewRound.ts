import { resolveMediaType, type FieldArguments, type Room } from "@movie-date/core";
import { isConditionFailure } from "../lib/db.js";
import { publishRoomEvent } from "../lib/events.js";
import type { ResolverContext } from "../lib/identity.js";
import { roundAttribute, roundCondition, roundOf } from "../lib/mediaMode.js";
import { FIRST_ROUND, getOrCreateProfile, loadRoom, updateRoomMeta } from "../lib/rooms.js";

export async function startNewRound(
  args: FieldArguments["startNewRound"],
  context: ResolverContext,
): Promise<Room> {
  const mediaType = resolveMediaType(args.mediaType);
  const { userId } = context;
  const { roomId } = await getOrCreateProfile(context);
  try {
    const updated = await updateRoomMeta(roomId, {
      // Only the mode's own counter moves, which is why Keep Looking leaves the movie deck alone.
      updateExpression: "SET #round = if_not_exists(#round, :first) + :one",
      names: { "#round": roundAttribute(mediaType) },
      values: { ":one": 1, ":first": FIRST_ROUND, ":round": args.expectedRound },
      conditionExpression: roundCondition(mediaType, args.expectedRound),
    });
    await publishRoomEvent({
      roomId,
      type: "ROUND_RESET",
      mediaType,
      round: updated ? roundOf(updated, mediaType) : args.expectedRound + 1,
      actorId: userId,
    });
  } catch (error) {
    // Someone else pressed first: not an error, the caller just goes home.
    if (!isConditionFailure(error)) throw error;
  }
  return loadRoom(roomId, userId);
}
