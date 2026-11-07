import { movieKey, type FieldArguments, type Movie, type SwipeDirection, type SwipeResult } from "@movie-date/core";
import {
  cancellationCodes,
  getItem,
  isTransactionCancelled,
  tableName,
  transactWrite,
  type TransactItems,
} from "../lib/db.js";
import { ConflictError, ValidationError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { evaluateMovie } from "../lib/matching.js";
import {
  backoff,
  failedCondition,
  getOrCreateProfile,
  MAX_TRANSACTION_ATTEMPTS,
  requireRoomMeta,
  type SwipeItem,
} from "../lib/rooms.js";
import { getMovie } from "../lib/tmdb.js";

interface SwipeWrite {
  roomId: string;
  round: number;
  userId: string;
  movieId: number;
  direction: SwipeDirection;
  movie: Movie;
}

/**
 * The member check stops a swipe that was in flight during a leave from adding a
 * like nobody would ever remove. META is deliberately not checked: every swipe
 * in the room would then contend on one row, and a swipe landing in a round that
 * just ended is harmless because a match there is refused anyway. The order of
 * these writes is relied on when reading cancellation codes below.
 */
function swipeWrites(write: SwipeWrite): TransactItems {
  const { roomId, round, userId, movieId, direction, movie } = write;
  const row: SwipeItem = {
    ...keys.swipe(roomId, round, userId, movieKey(movieId)),
    movieId,
    direction,
    swipedAt: new Date().toISOString(),
    movie,
  };
  const writes: TransactItems = [
    {
      Put: {
        TableName: tableName(),
        Item: row,
        ConditionExpression: "attribute_not_exists(pk)",
      },
    },
    {
      ConditionCheck: {
        TableName: tableName(),
        Key: keys.member(roomId, userId),
        ConditionExpression: "attribute_exists(pk)",
      },
    },
  ];
  if (direction === "LIKE") {
    writes.push({
      Update: {
        TableName: tableName(),
        Key: keys.tally(roomId, round, movieKey(movieId)),
        UpdateExpression: "ADD likes :one SET movie = if_not_exists(movie, :movie), movieId = :movieId",
        ExpressionAttributeValues: { ":one": 1, ":movie": movie, ":movieId": movieId },
      },
    });
  }
  return writes;
}

export async function swipe(
  args: FieldArguments["swipe"],
  context: ResolverContext,
): Promise<SwipeResult> {
  const { movieId, direction } = args;
  const { userId } = context;
  if (!Number.isInteger(movieId) || movieId <= 0) throw new ValidationError("Unknown movie.");

  let movie: Movie | undefined;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    // Re-read every pass: the caller may have changed rooms or the round advanced.
    const { roomId } = await getOrCreateProfile(context);
    const { round } = await requireRoomMeta(roomId);

    const existing = await getItem<SwipeItem>(keys.swipe(roomId, round, userId, movieKey(movieId)), {
      consistent: true,
    });
    if (existing) {
      // A repeat still evaluates: the original may have died before its check ran.
      const match =
        existing.direction === "LIKE" ? await evaluateMovie(roomId, round, movieId, userId) : null;
      return { movieId, direction: existing.direction, match };
    }

    movie ??= await getMovie(movieId);
    try {
      await transactWrite(swipeWrites({ roomId, round, userId, movieId, direction, movie }));
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      const [swipeCode, memberCode] = cancellationCodes(error);
      if (!failedCondition(swipeCode) && !failedCondition(memberCode)) await backoff(attempt);
      continue;
    }
    const match = direction === "LIKE" ? await evaluateMovie(roomId, round, movieId, userId) : null;
    return { movieId, direction, match };
  }
  throw new ConflictError();
}
