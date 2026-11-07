/**
 * Single-table key builders, one per row in the spec's data model. Handlers use
 * these rather than building key strings inline.
 */

import { parseMediaKey, type MediaKey, type MediaRef } from "@movie-date/core";

export interface TableKey {
  pk: string;
  sk: string;
}

export function userPk(sub: string): string {
  return `USER#${sub}`;
}

export function roomPk(roomId: string): string {
  return `ROOM#${roomId}`;
}

export function profile(sub: string): TableKey {
  return { pk: userPk(sub), sk: "PROFILE" };
}

export function roomMeta(roomId: string): TableKey {
  return { pk: roomPk(roomId), sk: "META" };
}

export function member(roomId: string, sub: string): TableKey {
  return { pk: roomPk(roomId), sk: `MEMBER#${sub}` };
}

export function swipe(roomId: string, round: number, sub: string, media: MediaKey): TableKey {
  return { pk: roomPk(roomId), sk: `SWIPE#${round}#${sub}#${media}` };
}

export function tally(roomId: string, round: number, media: MediaKey): TableKey {
  return { pk: roomPk(roomId), sk: `TALLY#${round}#${media}` };
}

/** `matchedAt` leads so a reverse query reads newest first. */
export function match(roomId: string, matchedAt: string, media: MediaKey): TableKey {
  return { pk: roomPk(roomId), sk: `MATCH#${matchedAt}#${media}` };
}

/** The timestamp a match row's sort key leads with. It can't hold a `#`. */
export function matchedAtOfSk(sk: string): string {
  return sk.split("#")[1] ?? "";
}

/** Sentinel whose conditional put decides the single winner of a match. */
export function matched(roomId: string, round: number, media: MediaKey): TableKey {
  return { pk: roomPk(roomId), sk: `MATCHED#${round}#${media}` };
}

export function roomCode(code: string): TableKey {
  return { pk: `CODE#${code}`, sk: "ROOM" };
}

export function cache(kind: string, key: string): TableKey {
  return { pk: `CACHE#${kind}#${key}`, sk: "CACHE" };
}

/** Under the user's own partition, so it leaves with the rest of their rows. */
export function userLimit(sub: string, name: string, window: string): TableKey {
  return { pk: userPk(sub), sk: `LIMIT#${name}#${window}` };
}

export function globalLimit(name: string, window: string): TableKey {
  return { pk: `LIMIT#${name}`, sk: window };
}

/** A pending emailed code. Under the user's partition, which is what binds it to them. */
export function plexLink(sub: string): TableKey {
  return { pk: userPk(sub), sk: "PLEX_LINK" };
}

/** Separate from the code row: the send limit has to hold when nothing was sent. */
export function plexLinkCooldown(sub: string): TableKey {
  return { pk: userPk(sub), sk: "PLEX_LINK_COOLDOWN" };
}

export function plexIndexLease(): TableKey {
  return { pk: "PLEX#INDEX", sk: "LEASE" };
}

/**
 * `begins_with` prefixes. Each ends at a `#` so round 1 can't pick up round 10,
 * and `matches()` keeps its trailing `#` so it can't pick up `MATCHED#` rows.
 */
export const prefixes = {
  members(): string {
    return "MEMBER#";
  },
  swipes(): string {
    return "SWIPE#";
  },
  roundSwipes(round: number): string {
    return `SWIPE#${round}#`;
  },
  userRoundSwipes(round: number, sub: string): string {
    return `SWIPE#${round}#${sub}#`;
  },
  roundTallies(round: number): string {
    return `TALLY#${round}#`;
  },
  matches(): string {
    return "MATCH#";
  },
  roundMatched(round: number): string {
    return `MATCHED#${round}#`;
  },
} as const;

export interface SwipeKeyParts extends MediaRef {
  round: number;
  sub: string;
}

/**
 * SWIPE, TALLY, MATCH and MATCHED rows all end in their title. It may be typed or
 * a bare id, and the live table is full of bare ones, so never pick a mode with a
 * `movie:` key prefix: read it here. An old row's mode exists nowhere else.
 */
export function mediaRefOfSk(sk: string): MediaRef {
  return parseMediaKey(sk.slice(sk.lastIndexOf("#") + 1));
}

/**
 * The tally a swipe counted towards. The title is copied as written, because the
 * likes of a bare-id swipe sit on a bare-id tally.
 */
export function tallyOfSwipe(row: TableKey): TableKey {
  const [, round, , media] = row.sk.split("#");
  return { pk: row.pk, sk: `TALLY#${round}#${media}` };
}

/** A swipe row keeps its round, owner and title only in the sort key. */
export function parseSwipeSk(sk: string): SwipeKeyParts {
  const [, round, sub, media] = sk.split("#");
  return { round: Number(round), sub: sub ?? "", ...parseMediaKey(media ?? "") };
}
