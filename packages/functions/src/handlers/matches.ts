import { resolveMediaType, type FieldArguments, type MatchPage } from "@movie-date/core";
import { decodePageToken, encodePageToken, queryAll } from "../lib/db.js";
import { ValidationError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { inMode } from "../lib/mediaMode.js";
import { getOrCreateProfile, pageSize, toMatch, type MatchItem } from "../lib/rooms.js";

function readCursor(token: string, pk: string): string {
  const { sk } = decodePageToken(token, pk);
  if (typeof sk !== "string") throw new ValidationError("Invalid page token.");
  return sk;
}

/**
 * Read whole and filtered here: a row's mode is only in its sort key, which a
 * DynamoDB filter can't see, and a room makes a few matches a night. The token
 * is the same `{ pk, sk }` a DynamoDB page gives, so one issued earlier still works.
 */
export async function matches(
  args: FieldArguments["matches"],
  context: ResolverContext,
): Promise<MatchPage> {
  const mediaType = resolveMediaType(args.mediaType);
  const { roomId } = await getOrCreateProfile(context);
  const pk = keys.roomPk(roomId);
  const rows = await queryAll<MatchItem>(pk, {
    skPrefix: keys.prefixes.matches(),
    descending: true,
  });
  const inThisMode = rows.filter(inMode(mediaType));

  const cursor = args.nextToken ? readCursor(args.nextToken, pk) : undefined;
  const remaining = cursor ? inThisMode.filter((row) => row.sk < cursor) : inThisMode;
  const page = remaining.slice(0, pageSize(args.limit));
  const last = page[page.length - 1];
  return {
    matches: page.map((item) => toMatch(item, roomId)),
    nextToken: last && remaining.length > page.length ? encodePageToken({ pk, sk: last.sk }) : null,
  };
}
