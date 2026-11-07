import type { Filters, WatchOption } from "@movie-date/core";
import { deck } from "@movie-date/functions/handlers/deck";
import { leaveRoom } from "@movie-date/functions/handlers/leaveRoom";
import { watchOptions } from "@movie-date/functions/handlers/watchOptions";
import { hasFileOnPlex, loadLibraryIndex, type LibraryMovie } from "@movie-date/functions/lib/plexIndex";
import { discoverMovies, hydrateMovies, type DiscoverPage } from "@movie-date/functions/lib/tmdb";
import { getWatchOptions } from "@movie-date/functions/lib/watch";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { movieNamed, roomOf, user } from "../support/roomFixture";

vi.mock("@movie-date/functions/lib/events");
vi.mock("@movie-date/functions/lib/tmdb");
vi.mock("@movie-date/functions/lib/watch");
vi.mock("@movie-date/functions/lib/plexIndex", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/plexIndex")>()),
  loadLibraryIndex: vi.fn(),
  hasFileOnPlex: vi.fn(),
}));

const ANA = user("ana");
const BEN = user("ben");
const NETFLIX_OPTION: WatchOption = {
  serviceId: "netflix",
  serviceName: "Netflix",
  type: "subscription",
  link: "https://netflix.example/1",
  logoUrl: null,
};
const PLEX_OPTION: WatchOption = {
  serviceId: "plex",
  serviceName: "Plex",
  type: "library",
  link: null,
  logoUrl: null,
};

let dynamo: FakeDynamo;

function libraryMovie(id: number, overrides: Partial<LibraryMovie> = {}): LibraryMovie {
  return {
    id,
    genreIds: [18],
    castIds: [287],
    releaseDate: "2020-06-01",
    popularity: 1000 - id,
    hasFile: true,
    ...overrides,
  };
}

function givenIndex(movies: LibraryMovie[]): void {
  vi.mocked(loadLibraryIndex).mockResolvedValue({ generatedAt: "2026-03-01T00:00:00.000Z", movies });
}

function discoverPage(ids: number[], totalPages = 1): DiscoverPage {
  return {
    totalPages,
    totalResults: ids.length * totalPages,
    results: ids.map((id) => ({ id, originalLanguage: "en", hasPoster: true })),
  };
}

function filtersWith(overrides: Partial<Filters>): Filters {
  return { genreIds: [], cast: [], services: ["plex"], ...overrides };
}

async function givenRoomFilters(filters: Filters, linked = true): Promise<string> {
  const room = await roomOf("ana", "ben");
  const meta = dynamo.row(`ROOM#${room.id}`, "META");
  if (!meta) throw new Error("No room");
  dynamo.seed({ ...meta, filters });
  if (linked) givenLinked("ana");
  return room.id;
}

function givenLinked(name: string): void {
  const profile = dynamo.row(`USER#sub-${name}`, "PROFILE");
  if (!profile) throw new Error("No profile");
  dynamo.seed({ ...profile, plexUserId: `plex-${name}`, plexEmail: `${name}@example.com` });
}

function givenSwiped(roomId: string, name: string, ids: number[]): void {
  for (const id of ids) {
    dynamo.seed({ pk: `ROOM#${roomId}`, sk: `SWIPE#1#sub-${name}#movie:${id}`, direction: "PASS" });
  }
}

function dealtIds(page: { cards: { movie: { id: number } }[] }): number[] {
  return page.cards.map((card) => card.movie.id);
}

beforeEach(() => {
  dynamo = new FakeDynamo();
  vi.mocked(hydrateMovies).mockImplementation(async (ids) =>
    ids.map((id) => ({ ...movieNamed(id), posterUrl: `https://img/${id}.jpg` })),
  );
  vi.mocked(discoverMovies).mockResolvedValue(discoverPage([]));
  vi.mocked(getWatchOptions).mockResolvedValue([NETFLIX_OPTION]);
  vi.mocked(hasFileOnPlex).mockResolvedValue(true);
  givenIndex([]);
});

afterEach(() => {
  dynamo.restore();
  vi.resetAllMocks();
});

describe("Plex alone", () => {
  it("deals the library by popularity without asking TMDB to discover", async () => {
    givenIndex([
      libraryMovie(1, { popularity: 5 }),
      libraryMovie(2, { popularity: 50 }),
      libraryMovie(3, { popularity: 20 }),
    ]);
    await givenRoomFilters(filtersWith({}));
    const page = await deck({ page: 1 }, ANA);
    expect(dealtIds(page)).toEqual([2, 3, 1]);
    expect(page.nextPage).toBeNull();
    expect(discoverMovies).not.toHaveBeenCalled();
  });

  it("hydrates through the normal path", async () => {
    givenIndex([libraryMovie(1)]);
    await givenRoomFilters(filtersWith({}));
    await deck({ page: 1 }, ANA);
    expect(hydrateMovies).toHaveBeenCalledWith([1]);
  });

  it("only counts titles with a file", async () => {
    givenIndex([libraryMovie(1, { hasFile: false }), libraryMovie(2)]);
    await givenRoomFilters(filtersWith({}));
    expect(dealtIds(await deck({ page: 1 }, ANA))).toEqual([2]);
  });

  it("filters by any chosen genre", async () => {
    givenIndex([
      libraryMovie(1, { genreIds: [28] }),
      libraryMovie(2, { genreIds: [35, 18] }),
      libraryMovie(3, { genreIds: [99] }),
    ]);
    await givenRoomFilters(filtersWith({ genreIds: [18, 28] }));
    expect(dealtIds(await deck({ page: 1 }, ANA))).toEqual([1, 2]);
  });

  it("filters by any chosen actor", async () => {
    givenIndex([libraryMovie(1, { castIds: [10] }), libraryMovie(2, { castIds: [20, 30] })]);
    const cast = [{ id: 30, name: "An Actor" }];
    await givenRoomFilters(filtersWith({ cast }));
    expect(dealtIds(await deck({ page: 1 }, ANA))).toEqual([2]);
  });

  it("filters by date, inclusive, dropping titles with no date", async () => {
    givenIndex([
      libraryMovie(1, { releaseDate: "1999-12-31" }),
      libraryMovie(2, { releaseDate: "2000-01-01" }),
      libraryMovie(3, { releaseDate: "2009-12-31" }),
      libraryMovie(4, { releaseDate: "2010-01-01" }),
      libraryMovie(5, { releaseDate: null }),
    ]);
    await givenRoomFilters(filtersWith({ releaseDateGte: "2000-01-01", releaseDateLte: "2009-12-31" }));
    expect(dealtIds(await deck({ page: 1 }, ANA))).toEqual([2, 3]);
  });

  it("pages through the library", async () => {
    givenIndex(Array.from({ length: 45 }, (_, index) => libraryMovie(index + 1)));
    await givenRoomFilters(filtersWith({}));
    const first = await deck({ page: 1 }, ANA);
    const third = await deck({ page: 3 }, ANA);
    expect(first.cards).toHaveLength(20);
    expect(first.nextPage).toBe(2);
    expect(dealtIds(third)).toEqual([41, 42, 43, 44, 45]);
    expect(third.nextPage).toBeNull();
  });

  it("drops swiped titles without shifting the next page", async () => {
    givenIndex(Array.from({ length: 40 }, (_, index) => libraryMovie(index + 1)));
    const roomId = await givenRoomFilters(filtersWith({}));
    givenSwiped(roomId, "ana", [1, 2, 3]);
    expect(dealtIds(await deck({ page: 1 }, ANA))).toHaveLength(17);
    expect(dealtIds(await deck({ page: 2 }, ANA))[0]).toBe(21);
  });

  it("walks past a fully swiped page", async () => {
    givenIndex(Array.from({ length: 30 }, (_, index) => libraryMovie(index + 1)));
    const roomId = await givenRoomFilters(filtersWith({}));
    givenSwiped(roomId, "ana", Array.from({ length: 20 }, (_, index) => index + 1));
    expect(dealtIds(await deck({ page: 1 }, ANA))[0]).toBe(21);
  });

  it("ends the deck when nothing in the library matches", async () => {
    givenIndex([libraryMovie(1, { genreIds: [99] })]);
    await givenRoomFilters(filtersWith({ genreIds: [18] }));
    expect(await deck({ page: 1 }, ANA)).toEqual({ cards: [], nextPage: null });
  });

  it("still leads with what a roommate liked", async () => {
    givenIndex([libraryMovie(1)]);
    const roomId = await givenRoomFilters(filtersWith({}));
    dynamo.seed({ pk: `ROOM#${roomId}`, sk: "TALLY#1#movie:77", likes: 1, movie: { ...movieNamed(77), posterUrl: "https://img/77.jpg" } });
    const page = await deck({ page: 1 }, ANA);
    expect(dealtIds(page)).toEqual([77, 1]);
    expect(page.cards[0]?.likedByRoommate).toBe(true);
  });

  it("deals the same to a member who hasn't linked", async () => {
    givenIndex([libraryMovie(1), libraryMovie(2)]);
    await givenRoomFilters(filtersWith({}));
    expect(dealtIds(await deck({ page: 1 }, BEN))).toEqual([1, 2]);
  });
});

describe("Plex with other services", () => {
  const services = ["plex", "netflix"];

  it("interleaves library and TMDB results", async () => {
    givenIndex([libraryMovie(1), libraryMovie(2)]);
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([101, 102, 103]));
    await givenRoomFilters(filtersWith({ services }));
    expect(dealtIds(await deck({ page: 1 }, ANA))).toEqual([1, 101, 2, 102, 103]);
  });

  it("deals a title in both only once, even when they meet on different pages", async () => {
    const library = Array.from({ length: 21 }, (_, index) => libraryMovie(index + 1));
    givenIndex(library);
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([21, 3, 500], 2));
    await givenRoomFilters(filtersWith({ services }));
    const first = dealtIds(await deck({ page: 1 }, ANA));
    expect(new Set(first).size).toBe(first.length);
    expect(first).not.toContain(21);
    expect(first).toContain(500);
    expect(first.filter((id) => id === 3)).toHaveLength(1);
    expect(dealtIds(await deck({ page: 2 }, ANA))).toContain(21);
  });

  it("keeps the TMDB exclusions and the swiped exclusions", async () => {
    givenIndex([libraryMovie(1), libraryMovie(2)]);
    vi.mocked(discoverMovies).mockResolvedValue({
      totalPages: 1,
      totalResults: null,
      results: [
        { id: 101, originalLanguage: "fr", hasPoster: true },
        { id: 102, originalLanguage: "en", hasPoster: false },
        { id: 103, originalLanguage: "en", hasPoster: true },
      ],
    });
    const roomId = await givenRoomFilters(filtersWith({ services }));
    givenSwiped(roomId, "ana", [1]);
    expect(dealtIds(await deck({ page: 1 }, ANA))).toEqual([103, 2]);
  });

  it("carries on through TMDB's pages after the library runs out", async () => {
    givenIndex([libraryMovie(1)]);
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([101], 4));
    await givenRoomFilters(filtersWith({ services }));
    const second = await deck({ page: 2 }, ANA);
    expect(dealtIds(second)).toEqual([101]);
    expect(second.nextPage).toBe(3);
  });

  it("carries on through the library after TMDB runs out", async () => {
    givenIndex(Array.from({ length: 21 }, (_, index) => libraryMovie(index + 1)));
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([], 1));
    await givenRoomFilters(filtersWith({ services }));
    expect((await deck({ page: 1 }, ANA)).nextPage).toBe(2);
  });
});

describe("when Plex can't apply", () => {
  it("ignores the key in a room with no linked member", async () => {
    givenIndex([libraryMovie(1)]);
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([101]));
    await givenRoomFilters(filtersWith({}), false);
    expect(dealtIds(await deck({ page: 1 }, ANA))).toEqual([101]);
  });

  it("doesn't empty the deck when the linked member leaves", async () => {
    givenIndex([libraryMovie(1)]);
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([101]));
    await givenRoomFilters(filtersWith({}));
    await leaveRoom({}, ANA);
    expect(dealtIds(await deck({ page: 1 }, BEN))).toEqual([101]);
  });

  it("falls back to TMDB until there's an index", async () => {
    vi.mocked(loadLibraryIndex).mockResolvedValue(null);
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([101]));
    await givenRoomFilters(filtersWith({}));
    expect(dealtIds(await deck({ page: 1 }, ANA))).toEqual([101]);
  });

  it("lets any win over plex, as it does over every service", async () => {
    givenIndex([libraryMovie(1)]);
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([101]));
    await givenRoomFilters(filtersWith({ services: ["plex", "any"] }));
    expect(dealtIds(await deck({ page: 1 }, ANA))).toEqual([101]);
  });

  it("reads no index for a room that didn't pick plex", async () => {
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([101]));
    await givenRoomFilters(filtersWith({ services: ["netflix"] }));
    await deck({ page: 1 }, ANA);
    expect(loadLibraryIndex).not.toHaveBeenCalled();
  });
});

describe("watchOptions", () => {
  it("adds Plex for every member of a room with a link", async () => {
    await givenRoomFilters(filtersWith({}));
    expect(await watchOptions({ movieId: 1 }, BEN)).toEqual([PLEX_OPTION, NETFLIX_OPTION]);
    expect(await watchOptions({ movieId: 1 }, ANA)).toEqual([PLEX_OPTION, NETFLIX_OPTION]);
  });

  it("leaves it out with no linked member", async () => {
    await givenRoomFilters(filtersWith({}), false);
    expect(await watchOptions({ movieId: 1 }, ANA)).toEqual([NETFLIX_OPTION]);
  });

  it("leaves it out when the title has no file", async () => {
    await givenRoomFilters(filtersWith({}));
    vi.mocked(hasFileOnPlex).mockResolvedValue(false);
    expect(await watchOptions({ movieId: 1 }, ANA)).toEqual([NETFLIX_OPTION]);
  });

  it("doesn't put Plex in the cache every room shares", async () => {
    await givenRoomFilters(filtersWith({}));
    await watchOptions({ movieId: 1 }, ANA);
    expect(getWatchOptions).toHaveBeenCalledWith(1, ANA.userId);
    expect(dynamo.findByPkPrefix("CACHE#")).toEqual([]);
  });

  it("keeps the real list when the Plex check fails", async () => {
    await givenRoomFilters(filtersWith({}));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.mocked(hasFileOnPlex).mockRejectedValue(new Error("S3 is down"));
    expect(await watchOptions({ movieId: 1 }, ANA)).toEqual([NETFLIX_OPTION]);
  });

  it("shows nothing from a room the caller left", async () => {
    await givenRoomFilters(filtersWith({}));
    await leaveRoom({}, BEN);
    expect(await watchOptions({ movieId: 1 }, BEN)).toEqual([NETFLIX_OPTION]);
  });
});
