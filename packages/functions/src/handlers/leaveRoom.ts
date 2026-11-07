import { randomUUID } from "node:crypto";
import { generateRoomCode, type FieldArguments, type Room } from "@movie-date/core";
import { isTransactionCancelled, transactWrite } from "../lib/db.js";
import { ConflictError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import { removeRoundSwipes, settleMove } from "../lib/matching.js";
import {
  backoff,
  getOrCreateProfile,
  loadRoom,
  MAX_TRANSACTION_ATTEMPTS,
  moveMemberWrites,
  newRoomWrites,
} from "../lib/rooms.js";

export async function leaveRoom(
  _args: FieldArguments["leaveRoom"],
  context: ResolverContext,
): Promise<Room> {
  const { userId } = context;
  const { roomId: leavingRoomId } = await getOrCreateProfile(context);

  // Before the move as well as after it; see joinRoom.
  await removeRoundSwipes(leavingRoomId, userId);

  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    // Pinned to the room this call set out to leave: on a double press the other
    // call may win, and a retry must not then leave the room that call just made.
    const { roomId: currentRoomId } = await getOrCreateProfile(context);
    if (currentRoomId !== leavingRoomId) return loadRoom(currentRoomId, userId);

    const now = new Date().toISOString();
    const freshRoomId = randomUUID();
    try {
      // The fresh room is in the same transaction so a losing press leaves no
      // orphan room behind.
      await transactWrite([
        ...moveMemberWrites(userId, leavingRoomId, freshRoomId, now),
        ...newRoomWrites(freshRoomId, generateRoomCode(), now),
      ]);
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      await backoff(attempt);
      continue;
    }
    await settleMove(userId, leavingRoomId, freshRoomId);
    return loadRoom(freshRoomId, userId);
  }
  throw new ConflictError();
}
