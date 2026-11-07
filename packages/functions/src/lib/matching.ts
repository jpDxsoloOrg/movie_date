import { randomUUID } from "node:crypto";
import {
  effectiveThreshold,
  findNewMatches,
  isMatch,
  mediaKey,
  type Match,
  type MediaType,
  type Movie,
  type Show,
} from "@movie-date/core";
import {
  cancellationCodes,
  getItem,
  isTransactionCancelled,
  queryAll,
  tableName,
  transactWrite,
  type TransactItems,
} from "./db.js";
import { ConflictError } from "./errors.js";
import { publishRoomEvent, revokeRoomSubscriptions } from "./events.js";
import * as keys from "./keys.js";
import { inMode, MEDIA_TYPES, roundAttribute, roundCondition, roundOf } from "./mediaMode.js";
import {
  backoff,
  failedCondition,
  loadMemberRows,
  MAX_TRANSACTION_ATTEMPTS,
  requireRoomMeta,
  toMatch,
  type MatchedItem,
  type MatchItem,
  type SwipeItem,
  type TallyItem,
} from "./rooms.js";

async function loadMatch(roomId: string, sentinel: MatchedItem): Promise<Match | null> {
  const row = await getItem<MatchItem>(
    { pk: keys.roomPk(roomId), sk: sentinel.matchSk },
    { consistent: true },
  );
  return row ? toMatch(row, roomId) : null;
}

interface MatchClaim {
  roomId: string;
  round: number;
  movieId: number;
  mediaType: MediaType;
  movie: Movie;
  show?: Show | undefined;
  threshold: number;
  actorId: string;
  matchedAt: string;
}

/**
 * Decides the single winner. The sentinel and the match row commit together, so
 * a crash can't leave a sentinel with no match. The tally and round are checked
 * in the same transaction because an undo or Back to Start may have landed since
 * the caller read them, and neither may produce a match. The order of these
 * writes is relied on when reading cancellation codes below.
 */
function matchWrites(claim: MatchClaim, matchId: string): TransactItems {
  const { roomId, round, movieId, mediaType, movie, show, threshold, matchedAt } = claim;
  const media = mediaKey(mediaType, movieId);
  const matchKey = keys.match(roomId, matchedAt, media);
  const matchRow: MatchItem = {
    ...matchKey,
    matchId,
    movieId,
    round,
    matchedAt,
    movie,
    ...(show ? { show } : {}),
  };
  const sentinel: MatchedItem = {
    ...keys.matched(roomId, round, media),
    matchId,
    movieId,
    matchSk: matchKey.sk,
  };
  return [
    {
      Put: {
        TableName: tableName(),
        Item: sentinel,
        ConditionExpression: "attribute_not_exists(pk)",
      },
    },
    { Put: { TableName: tableName(), Item: matchRow } },
    {
      ConditionCheck: {
        TableName: tableName(),
        Key: keys.tally(roomId, round, media),
        ConditionExpression: "likes >= :threshold",
        ExpressionAttributeValues: { ":threshold": threshold },
      },
    },
    {
      ConditionCheck: {
        TableName: tableName(),
        Key: keys.roomMeta(roomId),
        ConditionExpression: roundCondition(mediaType, round),
        ExpressionAttributeNames: { "#round": roundAttribute(mediaType) },
        ExpressionAttributeValues: { ":round": round },
      },
    },
  ];
}

async function claimMatch(claim: MatchClaim): Promise<Match | null> {
  const { roomId, round, movieId, mediaType, actorId, matchedAt } = claim;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const matchId = randomUUID();
    try {
      await transactWrite(matchWrites(claim, matchId));
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      const [sentinelCode, , tallyCode, roundCode] = cancellationCodes(error);
      if (failedCondition(sentinelCode)) {
        const winner = await getItem<MatchedItem>(
          keys.matched(roomId, round, mediaKey(mediaType, movieId)),
          { consistent: true },
        );
        return winner ? loadMatch(roomId, winner) : null;
      }
      if (failedCondition(tallyCode) || failedCondition(roundCode)) return null;
      await backoff(attempt);
      continue;
    }
    await publishRoomEvent({
      roomId,
      type: "MATCH_FOUND",
      movieId,
      mediaType,
      matchId,
      round,
      actorId,
    });
    return {
      id: matchId,
      roomId,
      round,
      matchedAt,
      mediaType,
      movie: claim.movie,
      show: claim.show ?? null,
    };
  }
  throw new ConflictError();
}

/**
 * The check that follows a like. It must read everything after the like has
 * committed: a threshold change writes first and scans tallies second, so one of
 * the two sides is guaranteed to see the other and no match can fall between
 * them. Returns the movie's match whoever made it, so a repeat of a swipe whose
 * response was lost, or the loser of a race, still gets it.
 */
export async function evaluateMovie(
  roomId: string,
  round: number,
  movieId: number,
  mediaType: MediaType,
  actorId: string,
): Promise<Match | null> {
  const media = mediaKey(mediaType, movieId);
  const [sentinel, tally, meta, memberRows] = await Promise.all([
    getItem<MatchedItem>(keys.matched(roomId, round, media), { consistent: true }),
    getItem<TallyItem>(keys.tally(roomId, round, media), { consistent: true }),
    requireRoomMeta(roomId),
    loadMemberRows(roomId),
  ]);
  if (sentinel) return loadMatch(roomId, sentinel);
  if (!tally || roundOf(meta, mediaType) !== round) return null;
  const threshold = effectiveThreshold(meta, memberRows.length);
  if (!isMatch(tally.likes, threshold)) return null;
  return claimMatch({
    roomId,
    round,
    movieId,
    mediaType,
    movie: tally.movie,
    show: tally.show,
    threshold,
    actorId,
    matchedAt: new Date().toISOString(),
  });
}

async function reevaluateMode(roomId: string, mediaType: MediaType, actorId: string): Promise<void> {
  const meta = await requireRoomMeta(roomId);
  const round = roundOf(meta, mediaType);
  const pk = keys.roomPk(roomId);
  const [memberRows, allTallies, allSentinels] = await Promise.all([
    loadMemberRows(roomId),
    queryAll<TallyItem>(pk, { skPrefix: keys.prefixes.roundTallies(round), consistent: true }),
    queryAll<MatchedItem>(pk, { skPrefix: keys.prefixes.roundMatched(round), consistent: true }),
  ]);
  // These are keyed by bare id below, so a show must never meet the movie with its number.
  const tallies = allTallies.filter(inMode(mediaType));
  const sentinels = allSentinels.filter(inMode(mediaType));
  const threshold = effectiveThreshold(meta, memberRows.length);
  const alreadyMatched = new Set(sentinels.map((sentinel) => sentinel.movieId));
  const tallyByMovie = new Map(tallies.map((tally) => [tally.movieId, tally]));

  // Strongest first with strictly rising timestamps, even within one millisecond,
  // so the strongest match is the earliest of the round: the one `pendingMatch` shows.
  const startedAt = Date.now();
  const newMatches = findNewMatches(tallies, threshold, alreadyMatched);
  for (const [position, movieId] of newMatches.entries()) {
    const tally = tallyByMovie.get(movieId);
    if (tally) {
      await claimMatch({
        roomId,
        round,
        movieId,
        mediaType,
        movie: tally.movie,
        show: tally.show,
        threshold,
        actorId,
        matchedAt: new Date(startedAt + position).toISOString(),
      });
    }
  }
}

/** After a lowered threshold or a member change, which can tip many tallies at once. */
export async function reevaluateRoom(roomId: string, actorId: string): Promise<void> {
  for (const mediaType of MEDIA_TYPES) await reevaluateMode(roomId, mediaType, actorId);
}

/** Each entry is at most two transaction items; DynamoDB allows 100 per transaction. */
const SWIPES_PER_TRANSACTION = 40;

function swipeRemovalWrites(row: SwipeItem): TransactItems {
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
      Update: {
        TableName: tableName(),
        Key: keys.tallyOfSwipe(row),
        UpdateExpression: "ADD likes :decrement",
        ExpressionAttributeValues: { ":decrement": -1 },
      },
    });
  }
  return writes;
}

/**
 * Takes the caller's swipes and tally contributions out of the room's current
 * round in both modes. Each swipe and its decrement commit together, and the delete is
 * conditional, so this can be interrupted and re-run, or race an undo, without
 * a like being subtracted twice.
 */
export async function removeRoundSwipes(roomId: string, userId: string): Promise<void> {
  const meta = await requireRoomMeta(roomId);
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const perMode = await Promise.all(
      MEDIA_TYPES.map(async (mediaType) => {
        const rows = await queryAll<SwipeItem>(keys.roomPk(roomId), {
          skPrefix: keys.prefixes.userRoundSwipes(roundOf(meta, mediaType), userId),
          consistent: true,
        });
        return rows.filter(inMode(mediaType));
      }),
    );
    const rows = perMode.flat();
    try {
      for (let start = 0; start < rows.length; start += SWIPES_PER_TRANSACTION) {
        const chunk = rows.slice(start, start + SWIPES_PER_TRANSACTION);
        await transactWrite(chunk.flatMap(swipeRemovalWrites));
      }
      return;
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      await backoff(attempt);
    }
  }
  throw new ConflictError();
}

async function logFailure(description: string, work: Promise<void>): Promise<void> {
  try {
    await work;
  } catch (error) {
    console.error(`${description} failed`, error);
  }
}

/** Follow-up to a committed settings change; see `settleMove` for why it can't fail the caller. */
export async function settleRoom(roomId: string, actorId: string): Promise<void> {
  await logFailure("Room re-evaluation", reevaluateRoom(roomId, actorId));
}

/**
 * Runs after the caller has already moved, so nothing here may fail the request:
 * they are in the new room and retrying would be wrong. The second swipe removal
 * catches a swipe that slipped in between the pre-move removal and the move.
 */
export async function settleMove(
  userId: string,
  fromRoomId: string,
  toRoomId: string,
): Promise<void> {
  await logFailure("Departed member cleanup", removeRoundSwipes(fromRoomId, userId));
  // Ahead of the announcement. AppSync closes it asynchronously, so a leaver's socket
  // can still hear their own departure, but nothing after it.
  await revokeRoomSubscriptions(fromRoomId, userId);
  await Promise.all(
    [fromRoomId, toRoomId].map((roomId) =>
      publishRoomEvent({ roomId, type: "MEMBERS_CHANGED", actorId: userId }),
    ),
  );
  await settleRoom(fromRoomId, userId);
  await settleRoom(toRoomId, userId);
}
