import { mediaKey, movieKey, parseMediaKey } from "@movie-date/core";
import { describe, expect, it } from "vitest";

describe("media keys", () => {
  it("names the type so overlapping TMDB ids stay distinct", () => {
    expect(movieKey(550)).toBe("movie:550");
    expect(mediaKey("TV", 550)).toBe("tv:550");
  });

  it("round-trips", () => {
    expect(parseMediaKey(movieKey(550))).toEqual({ mediaType: "MOVIE", id: 550 });
    expect(parseMediaKey(mediaKey("TV", 1399))).toEqual({ mediaType: "TV", id: 1399 });
  });

  it("reads a bare number as a movie", () => {
    expect(parseMediaKey("550")).toEqual({ mediaType: "MOVIE", id: 550 });
  });

  it("refuses anything else", () => {
    expect(() => parseMediaKey("book:1")).toThrow("Not a media key");
    expect(() => parseMediaKey("")).toThrow("Not a media key");
  });
});
