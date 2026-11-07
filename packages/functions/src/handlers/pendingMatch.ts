import type { FieldArguments, Match } from "@movie-date/core";
import { getItem, queryAll } from "../lib/db.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import {
  getOrCreateProfile,
  requireRoomMeta,
  toMatch,
  type MatchedItem,
  type MatchItem,
} from "../lib/rooms.js";

export async function pendingMatch(
  _args: FieldArguments["pendingMatch"],
  context: ResolverContext,
): Promise<Match | null> {
  const { roomId } = await getOrCreateProfile(context);
  const { round } = await requireRoomMeta(roomId);
  const pk = keys.roomPk(roomId);
  const sentinels = await queryAll<MatchedItem>(pk, {
    skPrefix: keys.prefixes.roundMatched(round),
    consistent: true,
  });

  // The earliest, so everyone in the room lands on the same movie however many
  // matches the round picks up after it.
  const [first] = sentinels.sort((one, other) => one.matchSk.localeCompare(other.matchSk));
  if (!first) return null;
  const row = await getItem<MatchItem>({ pk, sk: first.matchSk }, { consistent: true });
  return row ? toMatch(row, roomId) : null;
}
