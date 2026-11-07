import {
  mediaKey,
  resolveMediaType,
  showAsMovie,
  type FieldArguments,
  type MediaType,
  type Movie,
  type Show,
  type SwipeDirection,
  type SwipeResult,
} from "@movie-date/core";
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
import { roundOf } from "../lib/mediaMode.js";
import {
  backoff,
  failedCondition,
  getOrCreateProfile,
  MAX_TRANSACTION_ATTEMPTS,
  requireRoomMeta,
  type SwipeItem,
} from "../lib/rooms.js";
import { getMovie } from "../lib/tmdb.js";
import { getShow } from "../lib/tmdbTv.js";

/** The snapshot stored on swipes and tallies. Matches are built from it. */
interface Title {
  movie: Movie;
  show?: Show;
}

async function loadTitle(mediaType: MediaType, id: number): Promise<Title> {
  if (mediaType === "MOVIE") return { movie: await getMovie(id) };
  const show = await getShow(id);
  return { movie: showAsMovie(show), show };
}

interface SwipeWrite {
  roomId: string;
  round: number;
  userId: string;
  movieId: number;
  mediaType: MediaType;
  direction: SwipeDirection;
  title: Title;
}

/**
 * The member check stops a swipe that was in flight during a leave from adding a
 * like nobody would ever remove. META is deliberately not checked: every swipe
 * in the room would then contend on one row, and a swipe landing in a round that
 * just ended is harmless because a match there is refused anyway. The order of
 * these writes is relied on when reading cancellation codes below.
 */
function swipeWrites(write: SwipeWrite): TransactItems {
  const { roomId, round, userId, movieId, mediaType, direction, title } = write;
  const { movie, show } = title;
  const media = mediaKey(mediaType, movieId);
  const row: SwipeItem = {
    ...keys.swipe(roomId, round, userId, media),
    movieId,
    direction,
    swipedAt: new Date().toISOString(),
    ...title,
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
        Key: keys.tally(roomId, round, media),
        // SHOW is a DynamoDB reserved word, so it can only be named through an alias.
        UpdateExpression: `ADD likes :one SET movie = if_not_exists(movie, :movie), movieId = :movieId${
          show ? ", #show = if_not_exists(#show, :show)" : ""
        }`,
        ExpressionAttributeValues: {
          ":one": 1,
          ":movie": movie,
          ":movieId": movieId,
          ...(show ? { ":show": show } : {}),
        },
        ...(show ? { ExpressionAttributeNames: { "#show": "show" } } : {}),
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
  const mediaType = resolveMediaType(args.mediaType);
  if (!Number.isInteger(movieId) || movieId <= 0) throw new ValidationError("Unknown movie.");

  let title: Title | undefined;
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    // Re-read every pass: the caller may have changed rooms or the round advanced.
    const { roomId } = await getOrCreateProfile(context);
    const round = roundOf(await requireRoomMeta(roomId), mediaType);

    const existing = await getItem<SwipeItem>(
      keys.swipe(roomId, round, userId, mediaKey(mediaType, movieId)),
      { consistent: true },
    );
    if (existing) {
      // A repeat still evaluates: the original may have died before its check ran.
      const match =
        existing.direction === "LIKE"
          ? await evaluateMovie(roomId, round, movieId, mediaType)
          : null;
      return { movieId, mediaType, direction: existing.direction, match };
    }

    title ??= await loadTitle(mediaType, movieId);
    try {
      await transactWrite(
        swipeWrites({ roomId, round, userId, movieId, mediaType, direction, title }),
      );
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      const [swipeCode, memberCode] = cancellationCodes(error);
      if (!failedCondition(swipeCode) && !failedCondition(memberCode)) await backoff(attempt);
      continue;
    }
    const match =
      direction === "LIKE" ? await evaluateMovie(roomId, round, movieId, mediaType) : null;
    return { movieId, mediaType, direction, match };
  }
  throw new ConflictError();
}
