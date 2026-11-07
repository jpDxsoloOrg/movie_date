import type { FieldArguments, UndoResult } from "@movie-date/core";
import {
  cancellationCodes,
  getItem,
  isTransactionCancelled,
  tableName,
  transactWrite,
  type TransactItems,
} from "../lib/db.js";
import { ConflictError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import {
  backoff,
  failedCondition,
  getOrCreateProfile,
  MAX_TRANSACTION_ATTEMPTS,
  requireRoomMeta,
  type SwipeItem,
} from "../lib/rooms.js";

/**
 * The delete is conditional so two undos can't both decrement, and the sentinel
 * check rides in the same transaction so an undo can't take back a like a match
 * was just built on. The order of these writes is relied on below.
 */
function undoWrites(roomId: string, round: number, row: SwipeItem): TransactItems {
  const writes: TransactItems = [
    {
      Delete: {
        TableName: tableName(),
        Key: { pk: row.pk, sk: row.sk },
        ConditionExpression: "attribute_exists(pk)",
      },
    },
    {
      ConditionCheck: {
        TableName: tableName(),
        Key: keys.matched(roomId, round, row.movieId),
        ConditionExpression: "attribute_not_exists(pk)",
      },
    },
  ];
  if (row.direction === "LIKE") {
    writes.push({
      Update: {
        TableName: tableName(),
        Key: keys.tally(roomId, round, row.movieId),
        UpdateExpression: "ADD likes :decrement",
        ExpressionAttributeValues: { ":decrement": -1 },
      },
    });
  }
  return writes;
}

export async function undoSwipe(
  args: FieldArguments["undoSwipe"],
  context: ResolverContext,
): Promise<UndoResult> {
  const { movieId } = args;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const { roomId } = await getOrCreateProfile(context);
    const { round } = await requireRoomMeta(roomId);
    const row = await getItem<SwipeItem>(keys.swipe(roomId, round, context.userId, movieId), {
      consistent: true,
    });
    if (!row) return { movieId, undone: false };

    try {
      await transactWrite(undoWrites(roomId, round, row));
      return { movieId, undone: true };
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      const [swipeCode, matchedCode] = cancellationCodes(error);
      if (failedCondition(swipeCode) || failedCondition(matchedCode)) {
        return { movieId, undone: false };
      }
      await backoff(attempt);
    }
  }
  throw new ConflictError();
}
