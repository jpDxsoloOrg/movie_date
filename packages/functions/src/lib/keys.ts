/**
 * Single-table key builders, one per row in the spec's data model. Handlers use
 * these rather than building key strings inline.
 */

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

export function swipe(roomId: string, round: number, sub: string, movieId: number): TableKey {
  return { pk: roomPk(roomId), sk: `SWIPE#${round}#${sub}#${movieId}` };
}

export function tally(roomId: string, round: number, movieId: number): TableKey {
  return { pk: roomPk(roomId), sk: `TALLY#${round}#${movieId}` };
}

/** `matchedAt` leads so a reverse query reads newest first. */
export function match(roomId: string, matchedAt: string, movieId: number): TableKey {
  return { pk: roomPk(roomId), sk: `MATCH#${matchedAt}#${movieId}` };
}

/** Sentinel whose conditional put decides the single winner of a match. */
export function matched(roomId: string, round: number, movieId: number): TableKey {
  return { pk: roomPk(roomId), sk: `MATCHED#${round}#${movieId}` };
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

export interface SwipeKeyParts {
  round: number;
  sub: string;
  movieId: number;
}

/** A swipe row keeps its round, owner and movie only in the sort key. */
export function parseSwipeSk(sk: string): SwipeKeyParts {
  const [, round, sub, movieId] = sk.split("#");
  return { round: Number(round), sub: sub ?? "", movieId: Number(movieId) };
}
