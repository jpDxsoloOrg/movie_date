import { GetParameterCommand, SSMClient } from "@aws-sdk/client-ssm";
import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { emptyFilters, type Filters } from "@movie-date/core";
import { getClient } from "@movie-date/functions/lib/db";
import { ValidationError } from "@movie-date/functions/lib/errors";
import {
  buildTvDiscoverQuery,
  discoverShows,
  findShowByTvdbId,
  getActorShows,
  getLibraryShowDetails,
  getShow,
  getShowRecord,
  getShowTrailerKey,
  getTmdbShowWatchProviders,
  getTvGenres,
  hydrateShows,
} from "@movie-date/functions/lib/tmdbTv";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { jsonResponse, stubFetch } from "../fetchStub";

const dynamo = mockClient(getClient());
const ssm = mockClient(SSMClient);

const details = {
  name: "Game of Thrones",
  overview: "Noble families.",
  first_air_date: "2011-04-17",
  last_air_date: "2019-05-19",
  status: "Ended",
  number_of_seasons: 8,
  number_of_episodes: 73,
  networks: [{ name: "HBO" }],
  episode_run_time: [],
  last_episode_to_air: { runtime: 80 },
  vote_average: 8.4,
  vote_count: 100,
  poster_path: "/p.jpg",
  backdrop_path: "/b.jpg",
  genres: [{ id: 18, name: "Drama" }],
  external_ids: { tvdb_id: 121361 },
  "watch/providers": {
    results: {
      US: { flatrate: [{ provider_id: 8 }], buy: [{ provider_id: 10 }, { provider_id: 8 }] },
      GB: { flatrate: [{ provider_id: 39 }] },
    },
  },
};

function filtersWith(overrides: Partial<Filters>): Filters {
  return { ...emptyFilters(), ...overrides };
}

beforeEach(() => {
  dynamo.reset();
  ssm.reset();
  dynamo.on(GetCommand).resolves({});
  dynamo.on(PutCommand).resolves({});
  ssm.on(GetParameterCommand).resolves({ Parameter: { Value: "tmdb-key" } });
  vi.stubEnv("TMDB_KEY_PARAM", "/test/tmdb");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("getShowRecord", () => {
  it("maps a show, with the deck's extras from the same call", async () => {
    const fetchStub = stubFetch((url) => {
      expect(url.pathname).toBe("/3/tv/1399");
      expect(url.searchParams.get("append_to_response")).toBe("watch/providers,external_ids");
      return jsonResponse(details);
    });
    expect(await getShowRecord(1399)).toEqual({
      show: {
        id: 1399,
        title: "Game of Thrones",
        overview: "Noble families.",
        firstAirYear: 2011,
        lastAirYear: 2019,
        status: "Ended",
        seasonCount: 8,
        episodeCount: 73,
        networks: ["HBO"],
        episodeRuntime: 80,
        voteAverage: 8.4,
        posterUrl: "https://image.tmdb.org/t/p/w780/p.jpg",
        backdropUrl: "https://image.tmdb.org/t/p/w1280/b.jpg",
        genres: ["Drama"],
      },
      providerIds: [8, 10],
      tvdbId: 121361,
    });
    expect(fetchStub).toHaveBeenCalledOnce();
  });

  it("caches under its own kind, since a movie can have the same id", async () => {
    stubFetch(() => jsonResponse(details));
    await getShow(550);
    const put = dynamo.commandCalls(PutCommand)[0]?.args[0].input.Item;
    expect(put?.pk).toBe("CACHE#show#550");
  });

  it("prefers the listed runtime, and hides one TMDB doesn't have", async () => {
    stubFetch(() => jsonResponse({ ...details, episode_run_time: [45, 60] }));
    expect((await getShow(1)).episodeRuntime).toBe(45);
    stubFetch(() =>
      jsonResponse({ ...details, last_episode_to_air: null, next_episode_to_air: { runtime: 30 } }),
    );
    expect((await getShow(2)).episodeRuntime).toBe(30);
    stubFetch(() => jsonResponse({ ...details, last_episode_to_air: { runtime: null } }));
    expect((await getShow(3)).episodeRuntime).toBeNull();
    stubFetch(() => jsonResponse({ ...details, episode_run_time: [0], last_episode_to_air: null }));
    expect((await getShow(4)).episodeRuntime).toBeNull();
  });

  it("leaves a last air year off a show that hasn't aired, and a rating off one with no votes", async () => {
    stubFetch(() => jsonResponse({ ...details, last_air_date: null, vote_count: 0, vote_average: 0 }));
    expect(await getShow(1)).toMatchObject({ lastAirYear: null, voteAverage: null });
  });

  it("refuses an id that isn't one", async () => {
    await expect(getShow(0)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("hydrateShows", () => {
  it("starts nothing after the deadline", async () => {
    const fetchStub = stubFetch(() => jsonResponse(details));
    expect(await hydrateShows([1, 2], Date.now() - 1)).toEqual([]);
    expect(fetchStub).not.toHaveBeenCalled();
  });
});

describe("buildTvDiscoverQuery", () => {
  it("defaults to shows you can start, without the news and chat shows", () => {
    vi.useFakeTimers({ now: new Date("2026-11-07T12:00:00Z") });
    expect(buildTvDiscoverQuery(emptyFilters(), 3)).toEqual({
      language: "en",
      with_original_language: "en",
      sort_by: "popularity.desc",
      include_adult: "false",
      page: "3",
      "first_air_date.lte": "2026-11-07",
      without_genres: "10763|10767",
    });
  });

  it("maps every filter it can", () => {
    const query = buildTvDiscoverQuery(
      filtersWith({
        genreIds: [18, 35],
        services: ["netflix", "hulu"],
        firstAirDateGte: "2019-01-01",
        firstAirDateLte: "2023-12-31",
        showStatus: "FINISHED",
      }),
      1,
    );
    expect(query).toMatchObject({
      with_genres: "18|35",
      with_watch_providers: "8|15",
      watch_region: "US",
      "first_air_date.gte": "2019-01-01",
      "first_air_date.lte": "2023-12-31",
      with_status: "3|4",
    });
  });

  it("brings a hidden genre back when someone picks it", () => {
    expect(buildTvDiscoverQuery(filtersWith({ genreIds: [10767] }), 1).without_genres).toBe("10763");
    expect(buildTvDiscoverQuery(filtersWith({ genreIds: [10763, 10767] }), 1)).not.toHaveProperty(
      "without_genres",
    );
  });

  it("never sends with_cast, which discover/tv ignores, or a season count, which it lacks", () => {
    const query = buildTvDiscoverQuery(
      filtersWith({ cast: [{ id: 17419, name: "Bryan Cranston" }], commitment: "LONG_HAUL" }),
      1,
    );
    expect(Object.keys(query).join()).not.toMatch(/cast|season/);
  });
});

describe("discoverShows", () => {
  it("reads the same page shape as movies", async () => {
    stubFetch((url) => {
      expect(url.pathname).toBe("/3/discover/tv");
      return jsonResponse({
        total_pages: 2,
        total_results: 30,
        results: [{ id: 1, original_language: "en", poster_path: "/p.jpg" }],
      });
    });
    expect(await discoverShows(emptyFilters(), 1)).toEqual({
      totalPages: 2,
      totalResults: 30,
      results: [{ id: 1, originalLanguage: "en", hasPoster: true }],
    });
  });
});

describe("catalogue lookups", () => {
  it("has its own genre list", async () => {
    stubFetch((url) => {
      expect(url.pathname).toBe("/3/genre/tv/list");
      return jsonResponse({ genres: [{ id: 10765, name: "Sci-Fi & Fantasy" }] });
    });
    expect(await getTvGenres()).toEqual([{ id: 10765, name: "Sci-Fi & Fantasy" }]);
    expect(dynamo.commandCalls(PutCommand)[0]?.args[0].input.Item?.pk).toBe("CACHE#genres#tv");
  });

  it("ranks trailers as movies do, cached apart from a movie's", async () => {
    stubFetch((url) => {
      expect(url.pathname).toBe("/3/tv/1399/videos");
      return jsonResponse({
        results: [
          { site: "YouTube", key: "teaser", type: "Teaser" },
          { site: "YouTube", key: "official", type: "Trailer", official: true },
        ],
      });
    });
    expect(await getShowTrailerKey(1399)).toBe("official");
    expect(dynamo.commandCalls(PutCommand)[0]?.args[0].input.Item?.pk).toBe("CACHE#trailer#tv:1399");
  });

  it("reads US providers", async () => {
    stubFetch((url) => {
      expect(url.pathname).toBe("/3/tv/1399/watch/providers");
      return jsonResponse({ results: { US: { link: "https://tmdb/watch" }, GB: {} } });
    });
    expect(await getTmdbShowWatchProviders(1399)).toEqual({ link: "https://tmdb/watch" });
  });
});

describe("getActorShows", () => {
  it("keeps roles and drops appearances as themselves", async () => {
    stubFetch((url) => {
      expect(url.pathname).toBe("/3/person/17419/tv_credits");
      return jsonResponse({
        cast: [
          {
            id: 1396,
            character: "Walter White",
            genre_ids: [18, 80],
            first_air_date: "2008-01-20",
            original_language: "en",
            poster_path: "/p.jpg",
            popularity: 300,
            episode_count: 62,
          },
          { id: 1489, character: "Self", genre_ids: [10767] },
          { id: 319, character: "Self - Guest", genre_ids: [10767] },
          { id: 509, character: "", genre_ids: [18] },
        ],
      });
    });
    const shows = await getActorShows(17419);
    expect(shows.map((show) => show.id)).toEqual([1396, 509]);
    expect(shows[0]).toEqual({
      id: 1396,
      genreIds: [18, 80],
      firstAirDate: "2008-01-20",
      originalLanguage: "en",
      hasPoster: true,
      popularity: 300,
      episodeCount: 62,
    });
  });

  it("has no shows for a person TMDB doesn't know", async () => {
    stubFetch(() => jsonResponse({}, 404));
    expect(await getActorShows(1)).toEqual([]);
  });
});

describe("for the library index", () => {
  it("finds a show by TVDB id", async () => {
    stubFetch((url) => {
      expect(url.pathname).toBe("/3/find/121361");
      expect(url.searchParams.get("external_source")).toBe("tvdb_id");
      return jsonResponse({ tv_results: [{ id: 1399 }], tv_episode_results: [{ id: 5 }] });
    });
    expect(await findShowByTvdbId(121361)).toBe(1399);
  });

  it("is null when TMDB has no show under that id, even with an episode", async () => {
    stubFetch(() => jsonResponse({ tv_results: [], tv_episode_results: [{ id: 5 }] }));
    expect(await findShowByTvdbId(1)).toBeNull();
  });

  it("keeps the cast of every season, capped", async () => {
    stubFetch((url) => {
      expect(url.searchParams.get("append_to_response")).toBe("aggregate_credits");
      return jsonResponse({
        ...details,
        popularity: 169,
        aggregate_credits: { cast: Array.from({ length: 30 }, (_, index) => ({ id: index + 1 })) },
      });
    });
    const library = await getLibraryShowDetails(1399);
    expect(library.castIds).toHaveLength(20);
    expect(library).toMatchObject({
      genreIds: [18],
      firstAirDate: "2011-04-17",
      popularity: 169,
      status: "Ended",
      seasonCount: 8,
    });
  });
});
