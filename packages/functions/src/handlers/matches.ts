import type { FieldArguments, MatchPage } from "@movie-date/core";
import { queryPage } from "../lib/db.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { getOrCreateProfile, pageSize, toMatch, type MatchItem } from "../lib/rooms.js";

export async function matches(
  args: FieldArguments["matches"],
  context: ResolverContext,
): Promise<MatchPage> {
  const { roomId } = await getOrCreateProfile(context);
  const page = await queryPage<MatchItem>(keys.roomPk(roomId), {
    skPrefix: keys.prefixes.matches(),
    descending: true,
    limit: pageSize(args.limit),
    nextToken: args.nextToken,
  });
  return {
    matches: page.items.map((item) => toMatch(item, roomId)),
    nextToken: page.nextToken,
  };
}
