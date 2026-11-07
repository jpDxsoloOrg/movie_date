import { mediaKey, movieKey } from "@movie-date/core";
import {
  cache,
  match,
  matched,
  mediaRefOfSk,
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
    expect(swipe("r1", 2, "u1", movieKey(99)).sk).toBe("SWIPE#2#u1#movie:99");
    expect(tally("r1", 2, movieKey(99)).sk).toBe("TALLY#2#movie:99");
    expect(match("r1", "2026-01-01T00:00:00.000Z", movieKey(99)).sk).toBe(
      "MATCH#2026-01-01T00:00:00.000Z#movie:99",
    );
    expect(matched("r1", 2, movieKey(99)).sk).toBe("MATCHED#2#movie:99");
    expect(roomCode("ABC234")).toEqual({ pk: "CODE#ABC234", sk: "ROOM" });
    expect(cache("genres", "all")).toEqual({ pk: "CACHE#genres#all", sk: "CACHE" });
  });

  it("keeps round prefixes from spilling into later rounds", () => {
    expect(swipe("r1", 10, "u1", movieKey(5)).sk.startsWith(prefixes.roundSwipes(1))).toBe(false);
    expect(tally("r1", 10, movieKey(5)).sk.startsWith(prefixes.roundTallies(1))).toBe(false);
  });

  it("keeps the match prefix off the sentinels", () => {
    expect(matched("r1", 1, movieKey(5)).sk.startsWith(prefixes.matches())).toBe(false);
  });

  it("recovers a swipe's round, owner and movie from its sort key", () => {
    expect(parseSwipeSk(swipe("r1", 3, "u1", movieKey(42)).sk)).toEqual({
      round: 3,
      sub: "u1",
      mediaType: "MOVIE",
      id: 42,
    });
  });

  it("keeps a movie and a show with the same TMDB id apart", () => {
    expect(tally("r1", 1, mediaKey("TV", 550)).sk).not.toBe(tally("r1", 1, movieKey(550)).sk);
    expect(parseSwipeSk(swipe("r1", 1, "u1", mediaKey("TV", 550)).sk)).toMatchObject({
      mediaType: "TV",
      id: 550,
    });
  });

  it.each([
    ["MATCH#2026-01-01T00:00:00.000Z#550", "MOVIE"],
    ["MATCH#2026-01-01T00:00:00.000Z#movie:550", "MOVIE"],
    ["MATCH#2026-01-01T00:00:00.000Z#tv:550", "TV"],
    ["MATCHED#3#550", "MOVIE"],
    ["TALLY#3#tv:550", "TV"],
    ["SWIPE#3#u1#550", "MOVIE"],
  ])("reads the title off %s, typed or bare", (sk, mediaType) => {
    expect(mediaRefOfSk(sk)).toEqual({ mediaType, id: 550 });
  });

  it("still reads swipe rows written before keys carried a media type", () => {
    expect(parseSwipeSk("SWIPE#2#u1#99")).toEqual({
      round: 2,
      sub: "u1",
      mediaType: "MOVIE",
      id: 99,
    });
  });
});
