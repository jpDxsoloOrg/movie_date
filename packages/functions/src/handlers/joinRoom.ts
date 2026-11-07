import { isValidRoomCode, normaliseRoomCode, type FieldArguments, type Room } from "@movie-date/core";
import { getItem, isTransactionCancelled, transactWrite } from "../lib/db.js";
import { ConflictError, InvalidRoomCodeError, RateLimitedError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { HOUR_SECONDS, hourWindow, isExhausted, recordFailure } from "../lib/limits.js";
import { removeRoundSwipes, settleMove } from "../lib/matching.js";
import {
  backoff,
  getOrCreateProfile,
  loadRoom,
  MAX_TRANSACTION_ATTEMPTS,
  moveMemberWrites,
  type RoomCodeItem,
} from "../lib/rooms.js";

/** Plenty for typos, and it turns guessing a code into years of work per account. */
const MAX_WRONG_CODES_PER_HOUR = 10;

async function findRoomId(rawCode: string, userId: string): Promise<string> {
  const code = normaliseRoomCode(rawCode);
  // A malformed code never touches the table, so it tells a guesser nothing.
  if (!isValidRoomCode(code)) throw new InvalidRoomCodeError();
  const wrongCodes = keys.userLimit(userId, "join", hourWindow());
  // Ahead of the lookup: if a right code still worked here, refusals would mean "wrong".
  if (await isExhausted(wrongCodes, MAX_WRONG_CODES_PER_HOUR)) throw new RateLimitedError();
  const row = await getItem<RoomCodeItem>(keys.roomCode(code), { consistent: true });
  if (!row) {
    await recordFailure(wrongCodes, 2 * HOUR_SECONDS);
    throw new InvalidRoomCodeError();
  }
  return row.roomId;
}

export async function joinRoom(
  args: FieldArguments["joinRoom"],
  context: ResolverContext,
): Promise<Room> {
  const { userId } = context;
  const targetRoomId = await findRoomId(args.code, userId);

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
