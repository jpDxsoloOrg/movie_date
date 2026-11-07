export interface MovieTally {
  movieId: number;
  likes: number;
}

export function isMatch(likes: number, threshold: number): boolean {
  return likes >= threshold;
}

/**
 * Movies a lowered threshold or a member change has just tipped into a match,
 * most liked first so the strongest match is the one people see.
 */
export function findNewMatches(
  tallies: readonly MovieTally[],
  threshold: number,
  alreadyMatched: ReadonlySet<number>,
): number[] {
  return tallies
    .filter((tally) => isMatch(tally.likes, threshold) && !alreadyMatched.has(tally.movieId))
    .sort((first, second) => second.likes - first.likes)
    .map((tally) => tally.movieId);
}
