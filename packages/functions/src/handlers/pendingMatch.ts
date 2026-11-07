import { resolveMediaType, type FieldArguments, type Match } from "@movie-date/core";
import { getItem, queryAll } from "../lib/db.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { inMode, roundOf } from "../lib/mediaMode.js";
import {
  getOrCreateProfile,
  requireRoomMeta,
  toMatch,
  type MatchedItem,
  type MatchItem,
  type MemberItem,
} from "../lib/rooms.js";

export async function pendingMatch(
  args: FieldArguments["pendingMatch"],
  context: ResolverContext,
): Promise<Match | null> {
  const mediaType = resolveMediaType(args.mediaType);
  const { roomId } = await getOrCreateProfile(context);
  const round = roundOf(await requireRoomMeta(roomId), mediaType);
  const pk = keys.roomPk(roomId);
  const [sentinels, member] = await Promise.all([
    queryAll<MatchedItem>(pk, { skPrefix: keys.prefixes.roundMatched(round), consistent: true }),
    getItem<MemberItem>(keys.member(roomId, context.userId), { consistent: true }),
  ]);

  // Someone invited in isn't told about a match made before they arrived.
  const joinedAt = member?.joinedAt ?? "";
  const announced = sentinels
    .filter(inMode(mediaType))
    .filter((sentinel) => !sentinel.clearedAt && keys.matchedAtOfSk(sentinel.matchSk) >= joinedAt);

  // The earliest, so everyone in the room lands on the same movie however many
  // matches the round picks up after it.
  const [first] = announced.sort((one, other) => one.matchSk.localeCompare(other.matchSk));
  if (!first) return null;
  const row = await getItem<MatchItem>({ pk, sk: first.matchSk }, { consistent: true });
  return row ? toMatch(row, roomId) : null;
}
