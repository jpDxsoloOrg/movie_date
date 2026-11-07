import { resolveMediaType, type FieldArguments } from "@movie-date/core";
import { isTransactionCancelled, queryAll, tableName, transactWrite } from "../lib/db.js";
import { ConflictError } from "../lib/errors.js";
import { publishRoomEvent } from "../lib/events.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { inMode, roundOf } from "../lib/mediaMode.js";
import {
  backoff,
  getOrCreateProfile,
  MAX_TRANSACTION_ATTEMPTS,
  requireRoomMeta,
  type MatchedItem,
} from "../lib/rooms.js";

function clearWrite(key: keys.TableKey, clearedAt: string) {
  return {
    Update: {
      TableName: tableName(),
      Key: key,
      UpdateExpression: "SET clearedAt = :clearedAt",
      ConditionExpression: "attribute_exists(pk)",
      ExpressionAttributeValues: { ":clearedAt": clearedAt },
    },
  };
}

/** The sentinel stays, so the title can't match again this round. History keeps the match. */
export async function clearMatch(
  args: FieldArguments["clearMatch"],
  context: ResolverContext,
): Promise<boolean> {
  const mediaType = resolveMediaType(args.mediaType);
  const { roomId } = await getOrCreateProfile(context);
  const pk = keys.roomPk(roomId);
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const round = roundOf(await requireRoomMeta(roomId), mediaType);
    const sentinels = await queryAll<MatchedItem>(pk, {
      skPrefix: keys.prefixes.roundMatched(round),
      consistent: true,
    });
    const sentinel = sentinels.filter(inMode(mediaType)).find((row) => row.matchId === args.matchId);
    if (!sentinel) return false;
    if (sentinel.clearedAt) return true;

    const clearedAt = new Date().toISOString();
    try {
      await transactWrite([
        clearWrite({ pk, sk: sentinel.sk }, clearedAt),
        clearWrite({ pk, sk: sentinel.matchSk }, clearedAt),
      ]);
    } catch (error) {
      // An undo or another press can cancel this, so re-read rather than assume it landed.
      if (!isTransactionCancelled(error)) throw error;
      await backoff(attempt);
      continue;
    }
    await publishRoomEvent({
      roomId,
      type: "MATCH_CLEARED",
      mediaType,
      matchId: args.matchId,
      actorId: context.userId,
    });
    return true;
  }
  throw new ConflictError();
}
