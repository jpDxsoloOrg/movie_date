import {
  mediaKey,
  resolveMediaType,
  type FieldArguments,
  type MediaType,
  type UndoResult,
} from "@movie-date/core";
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
import { roundOf } from "../lib/mediaMode.js";
import {
  backoff,
  failedCondition,
  getOrCreateProfile,
  MAX_TRANSACTION_ATTEMPTS,
  requireRoomMeta,
  type MemberItem,
  type SwipeItem,
} from "../lib/rooms.js";

/**
 * The delete is conditional so two undos can't both decrement, and the sentinel
 * check rides in the same transaction so an undo can't take back a like a match
 * was just built on. Only a like is checked, and only against a match that could
 * rest on it: refusing a pass, a cleared match or one from before the caller joined
 * would tell them about a match they weren't part of.
 * The order of these writes is relied on below.
 */
function undoWrites(
  roomId: string,
  round: number,
  mediaType: MediaType,
  row: SwipeItem,
  joinedAt: string,
): TransactItems {
  const media = mediaKey(mediaType, row.movieId);
  const writes: TransactItems = [
    {
      Delete: {
        TableName: tableName(),
        Key: { pk: row.pk, sk: row.sk },
        ConditionExpression: "attribute_exists(pk)",
      },
    },
  ];
  if (row.direction === "LIKE") {
    writes.push({
      ConditionCheck: {
        TableName: tableName(),
        Key: keys.matched(roomId, round, media),
        ConditionExpression: "attribute_not_exists(pk) OR attribute_exists(clearedAt) OR matchSk < :joined",
        ExpressionAttributeValues: { ":joined": `MATCH#${joinedAt}` },
      },
    });
    writes.push({
      Update: {
        TableName: tableName(),
        Key: keys.tally(roomId, round, media),
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
  const mediaType = resolveMediaType(args.mediaType);
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const { roomId } = await getOrCreateProfile(context);
    const round = roundOf(await requireRoomMeta(roomId), mediaType);
    const row = await getItem<SwipeItem>(
      keys.swipe(roomId, round, context.userId, mediaKey(mediaType, movieId)),
      { consistent: true },
    );
    if (!row) return { movieId, mediaType, undone: false };
    const member = await getItem<MemberItem>(keys.member(roomId, context.userId), { consistent: true });

    try {
      await transactWrite(undoWrites(roomId, round, mediaType, row, member?.joinedAt ?? ""));
      return { movieId, mediaType, undone: true };
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      const [swipeCode, matchedCode] = cancellationCodes(error);
      if (failedCondition(swipeCode) || failedCondition(matchedCode)) {
        return { movieId, mediaType, undone: false };
      }
      await backoff(attempt);
    }
  }
  throw new ConflictError();
}
