import {
  buildDiscoverQuery,
  defaultReleaseDateGte,
  emptyFilters,
  withDefaultReleaseDate,
} from "@movie-date/core";
import { describe, expect, it } from "vitest";

describe("buildDiscoverQuery", () => {
  it("sends only the fixed parameters for empty filters", () => {
    expect(buildDiscoverQuery(emptyFilters(), 3)).toEqual({
      language: "en",
      sort_by: "popularity.desc",
      include_adult: "false",
      page: "3",
    });
  });

  it("pipe-joins every list", () => {
    const query = buildDiscoverQuery(
      {
        genreIds: [28, 35],
        cast: [
          { id: 7, name: "A" },
          { id: 9, name: "B" },
        ],
        services: ["netflix", "paramount"],
        releaseDateGte: "2020-01-01",
        releaseDateLte: "2021-06-30",
      },
      1,
    );
    expect(query).toMatchObject({
      with_genres: "28|35",
      with_cast: "7|9",
      with_watch_providers: "8|531|1770|1853",
      watch_region: "US",
      "primary_release_date.gte": "2020-01-01",
      "primary_release_date.lte": "2021-06-30",
    });
  });

  it("does not restrict providers when any is chosen", () => {
    const query = buildDiscoverQuery({ ...emptyFilters(), services: ["any", "hulu"] }, 1);
    expect(query).not.toHaveProperty("with_watch_providers");
    expect(query).not.toHaveProperty("watch_region");
  });

  it("ignores unknown service keys", () => {
    const query = buildDiscoverQuery({ ...emptyFilters(), services: ["nope"] }, 1);
    expect(query).not.toHaveProperty("with_watch_providers");
  });
});

describe("release date defaulting", () => {
  const now = new Date(2026, 5, 15);

  it("defaults to Jan 1 of the current year", () => {
    expect(defaultReleaseDateGte(now)).toBe("2026-01-01");
    expect(withDefaultReleaseDate(emptyFilters(), now).releaseDateGte).toBe("2026-01-01");
  });

  it("keeps a picked date", () => {
    const filters = { ...emptyFilters(), releaseDateGte: "1999-03-31" };
    expect(withDefaultReleaseDate(filters, now).releaseDateGte).toBe("1999-03-31");
  });
});
