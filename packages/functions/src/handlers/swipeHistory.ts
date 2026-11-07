import { resolveMediaType, type FieldArguments, type HistoryPage } from "@movie-date/core";
import { decodePageToken, encodePageToken, queryAll } from "../lib/db.js";
import { ValidationError } from "../lib/errors.js";
import { historyStart, titleMatcher } from "../lib/history.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { getOrCreateProfile, pageSize, type SwipeItem } from "../lib/rooms.js";

interface Cursor {
  swipedAt: string;
  sk: string;
}

function newestFirst(first: Cursor, second: Cursor): number {
  return second.swipedAt.localeCompare(first.swipedAt) || second.sk.localeCompare(first.sk);
}

function readCursor(token: string, pk: string): Cursor {
  const { swipedAt, sk } = decodePageToken(token, pk);
  if (typeof swipedAt !== "string" || typeof sk !== "string") {
    throw new ValidationError("Invalid page token.");
  }
  return { swipedAt, sk };
}

export async function swipeHistory(
  args: FieldArguments["swipeHistory"],
  context: ResolverContext,
): Promise<HistoryPage> {
  const mediaType = resolveMediaType(args.mediaType);
  const { userId } = context;
  const { roomId } = await getOrCreateProfile(context);
  const pk = keys.roomPk(roomId);
  const limit = pageSize(args.limit);

  const [rows, start] = await Promise.all([
    queryAll<SwipeItem>(pk, { skPrefix: keys.prefixes.swipes() }),
    historyStart(roomId, userId, "SWIPES", mediaType),
  ]);
  const hasTitle = titleMatcher(args.search);
  const own = rows
    .filter((row) => {
      const parts = keys.parseSwipeSk(row.sk);
      return parts.sub === userId && parts.mediaType === mediaType;
    })
    .filter((row) => row.swipedAt >= start && hasTitle(row.movie.title))
    .filter((row) => !args.direction || row.direction === args.direction)
    .sort(newestFirst);

  // A cursor rather than an offset: swipes arrive at the head of this list while
  // someone pages through it, which would shift an offset into duplicates.
  const cursor = args.nextToken ? readCursor(args.nextToken, pk) : undefined;
  const remaining = cursor ? own.filter((row) => newestFirst(row, cursor) > 0) : own;
  const page = remaining.slice(0, limit);
  const last = page[page.length - 1];

  return {
    entries: page.map((row) => ({
      mediaType,
      movie: row.movie,
      show: row.show ?? null,
      direction: row.direction,
      round: keys.parseSwipeSk(row.sk).round,
      swipedAt: row.swipedAt,
    })),
    nextToken:
      last && remaining.length > page.length
        ? encodePageToken({ pk, sk: last.sk, swipedAt: last.swipedAt })
        : null,
  };
}
