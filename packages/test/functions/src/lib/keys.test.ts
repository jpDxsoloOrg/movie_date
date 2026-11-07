import {
  cache,
  match,
  matched,
  member,
  parseSwipeSk,
  prefixes,
  profile,
  roomCode,
  roomMeta,
  swipe,
  tally,
} from "@movie-date/functions/lib/keys";
import { describe, expect, it } from "vitest";

describe("key builders", () => {
  it("match the spec's data model", () => {
    expect(profile("u1")).toEqual({ pk: "USER#u1", sk: "PROFILE" });
    expect(roomMeta("r1")).toEqual({ pk: "ROOM#r1", sk: "META" });
    expect(member("r1", "u1").sk).toBe("MEMBER#u1");
    expect(swipe("r1", 2, "u1", 99).sk).toBe("SWIPE#2#u1#99");
    expect(tally("r1", 2, 99).sk).toBe("TALLY#2#99");
    expect(match("r1", "2026-01-01T00:00:00.000Z", 99).sk).toBe(
      "MATCH#2026-01-01T00:00:00.000Z#99",
    );
    expect(matched("r1", 2, 99).sk).toBe("MATCHED#2#99");
    expect(roomCode("ABC234")).toEqual({ pk: "CODE#ABC234", sk: "ROOM" });
    expect(cache("genres", "all")).toEqual({ pk: "CACHE#genres#all", sk: "CACHE" });
  });

  it("keeps round prefixes from spilling into later rounds", () => {
    expect(swipe("r1", 10, "u1", 5).sk.startsWith(prefixes.roundSwipes(1))).toBe(false);
    expect(tally("r1", 10, 5).sk.startsWith(prefixes.roundTallies(1))).toBe(false);
  });

  it("keeps the match prefix off the sentinels", () => {
    expect(matched("r1", 1, 5).sk.startsWith(prefixes.matches())).toBe(false);
  });

  it("recovers a swipe's round, owner and movie from its sort key", () => {
    expect(parseSwipeSk(swipe("r1", 3, "u1", 42).sk)).toEqual({
      round: 3,
      sub: "u1",
      movieId: 42,
    });
  });
});
