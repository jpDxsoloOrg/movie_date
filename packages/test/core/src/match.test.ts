import { findNewMatches, isMatch } from "@movie-date/core";
import { describe, expect, it } from "vitest";

describe("isMatch", () => {
  it("needs the threshold reached", () => {
    expect(isMatch(1, 2)).toBe(false);
    expect(isMatch(2, 2)).toBe(true);
    expect(isMatch(3, 2)).toBe(true);
  });
});

describe("findNewMatches", () => {
  const tallies = [
    { movieId: 1, likes: 2 },
    { movieId: 2, likes: 4 },
    { movieId: 3, likes: 1 },
    { movieId: 4, likes: 3 },
  ];

  it("returns unmatched movies at the threshold, most liked first", () => {
    expect(findNewMatches(tallies, 2, new Set([4]))).toEqual([2, 1]);
  });

  it("does not reorder the caller's array", () => {
    findNewMatches(tallies, 2, new Set());
    expect(tallies[0]?.movieId).toBe(1);
  });

  it("returns nothing when no tally qualifies", () => {
    expect(findNewMatches(tallies, 5, new Set())).toEqual([]);
  });
});
