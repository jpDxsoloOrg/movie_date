import {
  COMMITMENT_SEASONS,
  mediaKey,
  movieKey,
  parseMediaKey,
  resolveMediaType,
  showAsMovie,
  type Show,
} from "@movie-date/core";
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

describe("resolveMediaType", () => {
  it("treats a missing or null argument as a movie", () => {
    expect(resolveMediaType(undefined)).toBe("MOVIE");
    expect(resolveMediaType(null)).toBe("MOVIE");
    expect(resolveMediaType("TV")).toBe("TV");
  });
});

describe("showAsMovie", () => {
  const show: Show = {
    id: 1399,
    title: "Game of Thrones",
    overview: "Seven noble families.",
    firstAirYear: 2011,
    lastAirYear: 2019,
    status: "Ended",
    seasonCount: 8,
    episodeCount: 73,
    networks: ["HBO"],
    episodeRuntime: 60,
    voteAverage: 8.4,
    posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
    backdropUrl: null,
    genres: ["Drama"],
  };

  it("fills the card face from the fields the two share", () => {
    expect(showAsMovie(show)).toEqual({
      id: 1399,
      title: "Game of Thrones",
      overview: "Seven noble families.",
      releaseYear: 2011,
      runtime: 60,
      voteAverage: 8.4,
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      backdropUrl: null,
      genres: ["Drama"],
    });
  });
});

describe("COMMITMENT_SEASONS", () => {
  it("leaves no gap between levels", () => {
    expect(COMMITMENT_SEASONS.SHORT_AND_SWEET.max).toBe(COMMITMENT_SEASONS.A_FEW_SEASONS.min - 1);
    expect(COMMITMENT_SEASONS.A_FEW_SEASONS.max).toBe(COMMITMENT_SEASONS.LONG_HAUL.min - 1);
    expect(COMMITMENT_SEASONS.LONG_HAUL.max).toBeNull();
  });
});
