import {
  clampThreshold,
  effectiveThreshold,
  majorityThreshold,
  maxThreshold,
} from "@movie-date/core";
import { describe, expect, it } from "vitest";

describe("majorityThreshold", () => {
  it.each([
    [1, 2],
    [2, 2],
    [3, 2],
    [4, 2],
    [5, 3],
    [6, 3],
    [7, 4],
  ])("%i members need %i likes", (members, expected) => {
    expect(majorityThreshold(members)).toBe(expected);
  });
});

describe("maxThreshold", () => {
  it("is the member count, but at least 2", () => {
    expect(maxThreshold(1)).toBe(2);
    expect(maxThreshold(5)).toBe(5);
  });
});

describe("clampThreshold", () => {
  it("holds the value between 2 and the member count", () => {
    expect(clampThreshold(1, 4)).toBe(2);
    expect(clampThreshold(3, 4)).toBe(3);
    expect(clampThreshold(9, 4)).toBe(4);
    expect(clampThreshold(3, 1)).toBe(2);
  });
});

describe("effectiveThreshold", () => {
  it("follows the member count while majority is on", () => {
    const settings = { matchThreshold: 2, requireMajority: true };
    expect(effectiveThreshold(settings, 4)).toBe(2);
    expect(effectiveThreshold(settings, 7)).toBe(4);
  });

  it("stays reachable after members leave", () => {
    expect(effectiveThreshold({ matchThreshold: 4, requireMajority: false }, 3)).toBe(3);
  });
});
