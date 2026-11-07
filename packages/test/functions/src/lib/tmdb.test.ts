import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { emptyFilters } from "@movie-date/core";
import { getClient } from "@movie-date/functions/lib/db";
import { NotFoundError, UpstreamError, ValidationError } from "@movie-date/functions/lib/errors";
import {
  discoverMovies,
  getGenres,
  getMovie,
  getTrailerKey,
  hydrateMovies,
  searchPeople,
} from "@movie-date/functions/lib/tmdb";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, stubFetch } from "../fetchStub";

const TMDB_KEY = "tmdb-secret-value";
const dynamo = mockClient(getClient());
const ssm = mockClient(SSMClient);

const fullDetails = {
  title: "Heat",
  overview: "A heist.",
  release_date: "1995-12-15",
  runtime: 170,
  vote_average: 7.9,
  vote_count: 100,
  poster_path: "/poster.jpg",
  backdrop_path: "/backdrop.jpg",
  genres: [{ id: 28, name: "Action" }, { id: 80, name: "Crime" }],
};

beforeEach(() => {
  dynamo.reset();
  ssm.reset();
  dynamo.on(GetCommand).resolves({});
  dynamo.on(PutCommand).resolves({});
  ssm.on(GetParameterCommand).resolves({ Parameter: { Value: TMDB_KEY } });
  vi.stubEnv("TMDB_KEY_PARAM", "/test/tmdb");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("getMovie", () => {
  it("maps details to a Movie with the spec's image sizes", async () => {
    const fetchStub = stubFetch(() => jsonResponse(fullDetails));
    expect(await getMovie(949)).toEqual({
      id: 949,
      title: "Heat",
      overview: "A heist.",
      releaseYear: 1995,
      runtime: 170,
      voteAverage: 7.9,
      posterUrl: "https://image.tmdb.org/t/p/w780/poster.jpg",
      backdropUrl: "https://image.tmdb.org/t/p/w1280/backdrop.jpg",
      genres: ["Action", "Crime"],
    });
    const url = new URL(fetchStub.mock.calls[0]?.[0] as URL);
    expect(url.pathname).toBe("/3/movie/949");
    expect(url.searchParams.get("api_key")).toBe(TMDB_KEY);
  });

  it("copes with every nullable field TMDB leaves empty", async () => {
    stubFetch(() =>
      jsonResponse({
        title: null,
        original_title: "Original",
        overview: null,
        release_date: "",
        runtime: 0,
        vote_average: 0,
        vote_count: 0,
        poster_path: null,
        backdrop_path: null,
      }),
    );
    expect(await getMovie(1)).toEqual({
      id: 1,
      title: "Original",
      overview: "",
      releaseYear: null,
      runtime: null,
      voteAverage: null,
      posterUrl: null,
      backdropUrl: null,
      genres: [],
    });
  });

  it("uses a fresh cached movie without calling TMDB", async () => {
    const stored = { id: 949, title: "Cached" };
    dynamo.on(GetCommand).resolves({ Item: { value: stored, expiresAt: 9_999_999_999 } });
    const fetchStub = stubFetch(() => jsonResponse(fullDetails));
    expect(await getMovie(949)).toEqual(stored);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("caches details for 7 days", async () => {
    stubFetch(() => jsonResponse(fullDetails));
    await getMovie(949);
    const item = dynamo.commandCalls(PutCommand)[0]?.args[0].input.Item;
    expect(item?.pk).toBe("CACHE#movie#949");
    expect(item?.expiresAt - Date.now() / 1000).toBeCloseTo(7 * 86_400, -1);
  });

  it("rejects an impossible id without calling TMDB", async () => {
    const fetchStub = stubFetch(() => jsonResponse(fullDetails));
    await expect(getMovie(0)).rejects.toBeInstanceOf(ValidationError);
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("maps a 404 to NotFoundError", async () => {
    stubFetch(() => jsonResponse({}, 404));
    await expect(getMovie(949)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("passes a timeout signal to fetch", async () => {
    const fetchStub = stubFetch(() => jsonResponse(fullDetails));
    await getMovie(949);
    expect(fetchStub.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("keeping the key out of errors and logs", () => {
  async function failureOutput(fail: () => Response | Promise<Response>): Promise<string> {
    const lines: unknown[][] = [];
    for (const method of ["error", "warn", "log"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        lines.push(args);
      });
    }
    stubFetch(fail);
    const error = await getMovie(949).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(UpstreamError);
    return JSON.stringify([lines, (error as Error).message, (error as Error).cause ?? null]);
  }

  it("on a network failure that names the URL", async () => {
    const output = await failureOutput(() => {
      throw new TypeError(`fetch failed for https://x/?api_key=${TMDB_KEY}`);
    });
    expect(output).not.toContain(TMDB_KEY);
  });

  it("on an error status", async () => {
    const output = await failureOutput(() => jsonResponse({}, 500));
    expect(output).not.toContain(TMDB_KEY);
    expect(output).toContain("500");
  });

  it("on a body that isn't JSON", async () => {
    const output = await failureOutput(() => new Response("<html>"));
    expect(output).not.toContain(TMDB_KEY);
  });
});

describe("hydrateMovies", () => {
  it("keeps the input order and never exceeds the concurrency bound", async () => {
    let inFlight = 0;
    let peak = 0;
    stubFetch(async (url) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      return jsonResponse({ title: url.pathname.split("/").pop() });
    });
    const ids = Array.from({ length: 20 }, (_, index) => index + 1);
    const movies = await hydrateMovies(ids);
    expect(movies.map((movie) => movie.id)).toEqual(ids);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(6);
  });

  it("drops a title that fails while others load", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubFetch((url) =>
      url.pathname.endsWith("/2") ? jsonResponse({}, 500) : jsonResponse({ title: "ok" }),
    );
    const movies = await hydrateMovies([1, 2, 3]);
    expect(movies.map((movie) => movie.id)).toEqual([1, 3]);
  });

  it("rethrows when an outage means nothing loaded", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    stubFetch(() => jsonResponse({}, 503));
    await expect(hydrateMovies([1, 2])).rejects.toBeInstanceOf(UpstreamError);
  });

  it("returns nothing, without failing, when the titles are simply gone", async () => {
    stubFetch(() => jsonResponse({}, 404));
    expect(await hydrateMovies([1, 2])).toEqual([]);
  });

  it("handles an empty list", async () => {
    expect(await hydrateMovies([])).toEqual([]);
  });
});

describe("discoverMovies", () => {
  it("sends the core query and summarises results", async () => {
    const fetchStub = stubFetch(() =>
      jsonResponse({
        total_pages: 7,
        results: [
          { id: 1, original_language: "en", poster_path: "/a.jpg" },
          { id: 2, original_language: "fr", poster_path: null },
          { id: null },
        ],
      }),
    );
    const page = await discoverMovies({ ...emptyFilters(), genreIds: [28, 35] }, 3);
    expect(page).toEqual({
      totalPages: 7,
      results: [
        { id: 1, originalLanguage: "en", hasPoster: true },
        { id: 2, originalLanguage: "fr", hasPoster: false },
      ],
    });
    const url = new URL(fetchStub.mock.calls[0]?.[0] as URL);
    expect(url.pathname).toBe("/3/discover/movie");
    expect(url.searchParams.get("with_genres")).toBe("28|35");
    expect(url.searchParams.get("page")).toBe("3");
  });
});

describe("getGenres", () => {
  it("caches under one key for 7 days", async () => {
    stubFetch(() => jsonResponse({ genres: [{ id: 28, name: "Action" }] }));
    expect(await getGenres()).toEqual([{ id: 28, name: "Action" }]);
    const item = dynamo.commandCalls(PutCommand)[0]?.args[0].input.Item;
    expect(item?.pk).toBe("CACHE#genres#movie");
    expect(item?.expiresAt - Date.now() / 1000).toBeCloseTo(7 * 86_400, -1);
  });
});

describe("searchPeople", () => {
  it("maps people and leaves a missing photo null", async () => {
    const fetchStub = stubFetch(() =>
      jsonResponse({
        results: [
          { id: 1, name: "Al", profile_path: "/al.jpg", known_for_department: "Acting" },
          { id: 2, name: "Bo", profile_path: null, known_for_department: null },
        ],
      }),
    );
    expect(await searchPeople("a & b")).toEqual([
      {
        id: 1,
        name: "Al",
        profileUrl: "https://image.tmdb.org/t/p/w185/al.jpg",
        knownForDepartment: "Acting",
      },
      { id: 2, name: "Bo", profileUrl: null, knownForDepartment: null },
    ]);
    const url = new URL(fetchStub.mock.calls[0]?.[0] as URL);
    expect(url.searchParams.get("query")).toBe("a & b");
    expect(url.searchParams.get("include_adult")).toBe("false");
  });
});

describe("getTrailerKey", () => {
  const video = (key: string, type: string, official: boolean, site = "YouTube") => ({
    key,
    type,
    official,
    site,
  });

  async function pick(results: unknown[]): Promise<string | null> {
    stubFetch(() => jsonResponse({ results }));
    return getTrailerKey(949);
  }

  it("prefers an official YouTube trailer", async () => {
    expect(
      await pick([
        video("teaser", "Teaser", true),
        video("fan", "Trailer", false),
        video("vimeo", "Trailer", true, "Vimeo"),
        video("official", "Trailer", true),
      ]),
    ).toBe("official");
  });

  it("then any trailer", async () => {
    expect(await pick([video("teaser", "Teaser", true), video("fan", "Trailer", false)])).toBe(
      "fan",
    );
  });

  it("then a teaser", async () => {
    expect(await pick([video("clip", "Clip", true), video("teaser", "Teaser", false)])).toBe(
      "teaser",
    );
  });

  it("is null when nothing can be embedded, and that's cached", async () => {
    expect(await pick([video("vimeo", "Trailer", true, "Vimeo")])).toBeNull();
    const item = dynamo.commandCalls(PutCommand)[0]?.args[0].input.Item;
    expect(item?.pk).toBe("CACHE#trailer#949");
    expect(item?.value).toBeNull();
    expect(item?.expiresAt - Date.now() / 1000).toBeCloseTo(7 * 86_400, -1);
  });
});
