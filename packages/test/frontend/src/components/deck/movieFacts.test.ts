import { describe, expect, it } from "vitest";
import {
  networkAndRating,
  networksLabel,
  seasonsLabel,
  showSummary,
  showYears,
} from "../../../../../frontend/src/components/deck/movieFacts";
import type { Show } from "@movie-date/frontend/services/api";

function makeShow(overrides: Partial<Show> = {}): Show {
  return {
    id: 1399,
    title: "Steady Hands",
    overview: "A slow burn.",
    firstAirYear: 2019,
    lastAirYear: 2023,
    status: "Ended",
    seasonCount: 4,
    episodeCount: 40,
    networks: ["HBO"],
    episodeRuntime: 55,
    voteAverage: 8.44,
    posterUrl: null,
    backdropUrl: null,
    genres: [],
    ...overrides,
  };
}

describe("showSummary", () => {
  it("reads years, seasons and status", () => {
    expect(showSummary(makeShow())).toBe("2019–2023 · 4 seasons · Ended");
  });

  it("leaves a running show's range open and calls it Still Running", () => {
    expect(showSummary(makeShow({ status: "Returning Series", lastAirYear: 2026 }))).toBe(
      "2019–present · 4 seasons · Still Running",
    );
  });

  it("drops whatever TMDB doesn't have", () => {
    expect(showSummary(makeShow({ status: null, seasonCount: null }))).toBe("2019–2023");
    expect(showSummary(makeShow({ firstAirYear: null, lastAirYear: null, status: null, seasonCount: null }))).toBe("");
  });
});

describe("showYears", () => {
  it("gives one year for a show that ended the year it began", () => {
    expect(showYears(makeShow({ lastAirYear: 2019 }))).toBe("2019");
  });

  it("closes the range on a cancelled show", () => {
    expect(showYears(makeShow({ status: "Canceled" }))).toBe("2019–2023");
  });
});

describe("seasonsLabel", () => {
  it("is singular for one season and absent for none", () => {
    expect(seasonsLabel(makeShow({ seasonCount: 1 }))).toBe("1 season");
    expect(seasonsLabel(makeShow({ seasonCount: 0 }))).toBeNull();
  });
});

describe("networks", () => {
  it("keeps to two networks", () => {
    expect(networksLabel(makeShow({ networks: ["HBO", "Max", "Sky"] }))).toBe("HBO, Max");
  });

  it("reads network then rating, without either if missing", () => {
    expect(networkAndRating(makeShow())).toBe("HBO · 8.4/10");
    expect(networkAndRating(makeShow({ networks: [] }))).toBe("8.4/10");
    expect(networkAndRating(makeShow({ voteAverage: 0 }))).toBe("HBO");
  });
});
