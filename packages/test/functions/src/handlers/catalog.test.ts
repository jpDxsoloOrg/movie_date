import { genres } from "@movie-date/functions/handlers/genres";
import { movie } from "@movie-date/functions/handlers/movie";
import { searchPeople } from "@movie-date/functions/handlers/searchPeople";
import { trailer } from "@movie-date/functions/handlers/trailer";
import { watchOptions } from "@movie-date/functions/handlers/watchOptions";
import * as tmdb from "@movie-date/functions/lib/tmdb";
import * as watch from "@movie-date/functions/lib/watch";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@movie-date/functions/lib/tmdb");
vi.mock("@movie-date/functions/lib/watch");

afterEach(() => {
  vi.resetAllMocks();
});

describe("thin catalogue handlers", () => {
  it("movie passes the id through", async () => {
    await movie({ id: 949 });
    expect(tmdb.getMovie).toHaveBeenCalledWith(949);
  });

  it("trailer passes the id through", async () => {
    vi.mocked(tmdb.getTrailerKey).mockResolvedValue("abc");
    expect(await trailer({ movieId: 949 })).toBe("abc");
  });

  it("watchOptions passes the id through", async () => {
    vi.mocked(watch.getWatchOptions).mockResolvedValue([]);
    expect(await watchOptions({ movieId: 949 }, { userId: "user-1" })).toEqual([]);
    expect(watch.getWatchOptions).toHaveBeenCalledWith(949, "user-1");
  });

  it("genres returns the list", async () => {
    vi.mocked(tmdb.getGenres).mockResolvedValue([{ id: 1, name: "Action" }]);
    expect(await genres()).toEqual([{ id: 1, name: "Action" }]);
  });
});

describe("searchPeople", () => {
  it("trims the query", async () => {
    vi.mocked(tmdb.searchPeople).mockResolvedValue([]);
    await searchPeople({ query: "  brad  " });
    expect(tmdb.searchPeople).toHaveBeenCalledWith("brad");
  });

  it("skips TMDB for a blank query, which it would reject", async () => {
    expect(await searchPeople({ query: "   " })).toEqual([]);
    expect(tmdb.searchPeople).not.toHaveBeenCalled();
  });
});
