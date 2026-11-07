import { isValidRoomCode, normaliseRoomCode, type FieldArguments, type Room } from "@movie-date/core";
import { getItem, isTransactionCancelled, transactWrite } from "../lib/db.js";
import { ConflictError, InvalidRoomCodeError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { removeRoundSwipes, settleMove } from "../lib/matching.js";
import {
  backoff,
  getOrCreateProfile,
  loadRoom,
  MAX_TRANSACTION_ATTEMPTS,
  moveMemberWrites,
  type RoomCodeItem,
} from "../lib/rooms.js";

async function findRoomId(rawCode: string): Promise<string> {
  const code = normaliseRoomCode(rawCode);
  if (!isValidRoomCode(code)) throw new InvalidRoomCodeError();
  const row = await getItem<RoomCodeItem>(keys.roomCode(code), { consistent: true });
  if (!row) throw new InvalidRoomCodeError();
  return row.roomId;
}

export async function joinRoom(
  args: FieldArguments["joinRoom"],
  context: ResolverContext,
): Promise<Room> {
  const { userId } = context;
  const targetRoomId = await findRoomId(args.code);

  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const { roomId: currentRoomId } = await getOrCreateProfile(context);
    if (currentRoomId === targetRoomId) return loadRoom(targetRoomId, userId);

    // Before the move too, not just after: if the Lambda dies once the caller has
    // moved, nothing would ever come back to take their likes out of the old room.
    await removeRoundSwipes(currentRoomId, userId);
    try {
      await transactWrite(
        moveMemberWrites(userId, currentRoomId, targetRoomId, new Date().toISOString()),
      );
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      await backoff(attempt);
      continue;
    }
    await settleMove(userId, currentRoomId, targetRoomId);
    return loadRoom(targetRoomId, userId);
  }
  throw new ConflictError();
}
