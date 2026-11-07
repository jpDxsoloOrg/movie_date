import { emptyFilters, showAsMovie, type Filters, type Show } from "@movie-date/core";
import { deck } from "@movie-date/functions/handlers/deck";
import { filterPreview } from "@movie-date/functions/handlers/filterPreview";
import { genres } from "@movie-date/functions/handlers/genres";
import { leaveRoom } from "@movie-date/functions/handlers/leaveRoom";
import { matches } from "@movie-date/functions/handlers/matches";
import { myRoom } from "@movie-date/functions/handlers/myRoom";
import { pendingMatch } from "@movie-date/functions/handlers/pendingMatch";
import { plexStatus } from "@movie-date/functions/handlers/plexStatus";
import { requestOnPlex } from "@movie-date/functions/handlers/requestOnPlex";
import { startNewRound } from "@movie-date/functions/handlers/startNewRound";
import { swipe } from "@movie-date/functions/handlers/swipe";
import { swipeHistory } from "@movie-date/functions/handlers/swipeHistory";
import { trailer } from "@movie-date/functions/handlers/trailer";
import { undoSwipe } from "@movie-date/functions/handlers/undoSwipe";
import { updateFilters } from "@movie-date/functions/handlers/updateFilters";
import { updateRoomSettings } from "@movie-date/functions/handlers/updateRoomSettings";
import { watchOptions } from "@movie-date/functions/handlers/watchOptions";
import { RateLimitedError, UpstreamError, ValidationError } from "@movie-date/functions/lib/errors";
import { globalLimit } from "@movie-date/functions/lib/keys";
import {
  loadShowIndex,
  showPresence,
  watchableShows,
  type LibraryShow,
} from "@movie-date/functions/lib/plexIndex";
import {
  GLOBAL_WALKS_PER_HOUR,
  MAX_ACTIVE_DECK_WALKS,
  USER_DECK_WALKS_PER_MINUTE,
  USER_PREVIEWS_PER_MINUTE,
} from "@movie-date/functions/lib/walkLimits";
import { getWatchOptions } from "@movie-date/functions/lib/watch";
import type { DiscoverPage } from "@movie-date/functions/lib/tmdb";
import {
  discoverShows,
  getActorShows,
  getShow,
  getShowTrailerKey,
  getTvGenres,
  hydrateShowRecords,
  hydrateShows,
  type ActorShow,
} from "@movie-date/functions/lib/tmdbTv";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { movieNamed, roomOf, showNamed, user } from "../support/roomFixture";

const publishRoomEvent = vi.hoisted(() => vi.fn());

vi.mock("@movie-date/functions/lib/events", () => ({
  publishRoomEvent,
  revokeRoomSubscriptions: async () => undefined,
}));
vi.mock("@movie-date/functions/lib/tmdb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/tmdb")>()),
  getMovie: async (id: number) => movieNamed(id),
  discoverMovies: async () => page([]),
  hydrateMovies: async () => [],
}));
vi.mock("@movie-date/functions/lib/tmdbTv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/tmdbTv")>()),
  discoverShows: vi.fn(),
  getActorShows: vi.fn(),
  getShow: vi.fn(),
  getShowTrailerKey: vi.fn(),
  getTvGenres: vi.fn(),
  hydrateShowRecords: vi.fn(),
  hydrateShows: vi.fn(),
}));
vi.mock("@movie-date/functions/lib/watch");
vi.mock("@movie-date/functions/lib/plexIndex", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/plexIndex")>()),
  loadShowIndex: vi.fn(),
  showPresence: vi.fn(),
}));

const ANN = user("ann");
const BOB = user("bob");
const TV = { mediaType: "TV" } as const;
/** A number both a movie and a show answer to, which is the whole point of the keys. */
const SHARED_ID = 550;

let table: FakeDynamo;
/** Details the show mock answers with, for anything a test doesn't override. */
let shows: Map<number, Show>;

function page(ids: number[], totalPages = 1, totalResults = ids.length * totalPages): DiscoverPage {
  return {
    totalPages,
    totalResults,
    results: ids.map((id) => ({ id, originalLanguage: "en", hasPoster: true })),
  };
}

function range(from: number, count: number): number[] {
  return Array.from({ length: count }, (_, index) => from + index);
}

function showFor(id: number): Show {
  return shows.get(id) ?? showNamed(id);
}

function filtersWith(overrides: Partial<Filters>): Filters {
  return { ...emptyFilters(), ...overrides };
}

function credit(id: number, overrides: Partial<ActorShow> = {}): ActorShow {
  return {
    id,
    genreIds: [18],
    firstAirDate: "2015-01-01",
    originalLanguage: "en",
    hasPoster: true,
    popularity: 10,
    episodeCount: 10,
    ...overrides,
  };
}

function libraryShow(id: number, overrides: Partial<LibraryShow> = {}): LibraryShow {
  return {
    id,
    tvdbId: id + 1000,
    genreIds: [18],
    castIds: [287],
    firstAirDate: "2015-01-01",
    popularity: 1000 - id,
    status: "Ended",
    seasonCount: 4,
    hasFile: false,
    ...overrides,
  };
}

function givenShowIndex(indexed: LibraryShow[] | null): void {
  const index = indexed && { generatedAt: "2026-03-01T00:00:00.000Z", shows: indexed };
  vi.mocked(loadShowIndex).mockResolvedValue(index);
  vi.mocked(showPresence).mockImplementation(async (id) => {
    if (!index?.shows.some((show) => show.id === id)) return "ABSENT";
    return watchableShows(index).some((show) => show.id === id) ? "WATCHABLE" : "WAITING";
  });
}

function eventsOf(type: string) {
  return publishRoomEvent.mock.calls.map(([event]) => event).filter((event) => event.type === type);
}

function dealtIds(result: { cards: { movie: { id: number } }[] }): number[] {
  return result.cards.map((card) => card.movie.id);
}

beforeEach(() => {
  table = new FakeDynamo();
  shows = new Map();
  publishRoomEvent.mockReset();
  publishRoomEvent.mockResolvedValue(undefined);
  vi.mocked(getShow).mockImplementation(async (id) => showFor(id));
  vi.mocked(hydrateShows).mockImplementation(async (ids) => ids.map(showFor));
  vi.mocked(hydrateShowRecords).mockImplementation(async (ids) =>
    ids.map((id) => ({ show: showFor(id), providerIds: id % 2 === 0 ? [8] : [15], tvdbId: null })),
  );
  vi.mocked(discoverShows).mockResolvedValue(page([]));
  vi.mocked(getActorShows).mockResolvedValue([]);
  givenShowIndex(null);
});

afterEach(() => {
  table.restore();
  vi.clearAllMocks();
  vi.useRealTimers();
});

describe("swiping", () => {
  it("keys a show apart from the movie with its number and keeps both snapshots", async () => {
    const room = await roomOf("ann");
    const pk = `ROOM#${room.id}`;
    await swipe({ movieId: SHARED_ID, direction: "PASS" }, ANN);
    const result = await swipe({ movieId: SHARED_ID, direction: "PASS", ...TV }, ANN);
    expect(result).toMatchObject({ mediaType: "TV", movieId: SHARED_ID, direction: "PASS" });
    expect(table.find(pk, "SWIPE#").map((row) => row.sk)).toEqual([
      `SWIPE#1#sub-ann#movie:${SHARED_ID}`,
      `SWIPE#1#sub-ann#tv:${SHARED_ID}`,
    ]);
    expect(table.row(pk, `SWIPE#1#sub-ann#tv:${SHARED_ID}`)).toMatchObject({
      movie: showAsMovie(showNamed(SHARED_ID)),
      show: showNamed(SHARED_ID),
    });
    expect(table.row(pk, `SWIPE#1#sub-ann#movie:${SHARED_ID}`)).not.toHaveProperty("show");
  });

  it("names show through an alias, because it's a DynamoDB reserved word", async () => {
    const room = await roomOf("ann", "bob");
    let expression = "";
    table.beforeTransaction((items) => {
      expression = items.find((item) => item.Update)?.Update?.UpdateExpression ?? "";
      return expression !== "";
    });
    await swipe({ movieId: 1, direction: "LIKE", ...TV }, ANN);
    expect(expression).toContain("#show = if_not_exists(#show, :show)");
    expect(table.row(`ROOM#${room.id}`, "TALLY#1#tv:1")).toMatchObject({ likes: 1, show: showNamed(1) });
  });

  it("matches when everyone goes steady, on a room that has no tvRound yet", async () => {
    const room = await roomOf("ann", "bob");
    expect(table.row(`ROOM#${room.id}`, "META")).not.toHaveProperty("tvRound");
    await swipe({ movieId: SHARED_ID, direction: "LIKE", ...TV }, ANN);
    const { match } = await swipe({ movieId: SHARED_ID, direction: "LIKE", ...TV }, BOB);
    expect(match).toMatchObject({
      mediaType: "TV",
      round: 1,
      show: showNamed(SHARED_ID),
      movie: showAsMovie(showNamed(SHARED_ID)),
    });
    expect(eventsOf("MATCH_FOUND")).toEqual([
      expect.objectContaining({ mediaType: "TV", movieId: SHARED_ID, round: 1 }),
    ]);
    const row = table.find(`ROOM#${room.id}`, "MATCH#")[0];
    expect(row?.sk).toMatch(new RegExp(`#tv:${SHARED_ID}$`));
    expect(row).toMatchObject({ show: showNamed(SHARED_ID) });
  });

  it("still matches after a Keep Looking has set tvRound", async () => {
    await roomOf("ann", "bob");
    await startNewRound({ expectedRound: 1, ...TV }, ANN);
    await swipe({ movieId: 1, direction: "LIKE", ...TV }, ANN);
    const { match } = await swipe({ movieId: 1, direction: "LIKE", ...TV }, BOB);
    expect(match).toMatchObject({ mediaType: "TV", round: 2 });
  });

  it("doesn't let a like on a movie count towards the show with its number", async () => {
    await roomOf("ann", "bob");
    await swipe({ movieId: SHARED_ID, direction: "LIKE" }, ANN);
    const { match } = await swipe({ movieId: SHARED_ID, direction: "LIKE", ...TV }, BOB);
    expect(match).toBeNull();
  });

  it("answers a repeat with the earlier swipe, and its match", async () => {
    await roomOf("ann", "bob");
    await swipe({ movieId: 1, direction: "LIKE", ...TV }, ANN);
    const { match } = await swipe({ movieId: 1, direction: "LIKE", ...TV }, BOB);
    const repeat = await swipe({ movieId: 1, direction: "LIKE", ...TV }, BOB);
    expect(repeat.match?.id).toBe(match?.id);
    expect(eventsOf("MATCH_FOUND")).toHaveLength(1);
  });

  it("undoes a show's like and leaves the movie's alone", async () => {
    const room = await roomOf("ann", "bob");
    const pk = `ROOM#${room.id}`;
    await swipe({ movieId: SHARED_ID, direction: "LIKE" }, ANN);
    await swipe({ movieId: SHARED_ID, direction: "LIKE", ...TV }, ANN);
    expect(await undoSwipe({ movieId: SHARED_ID, ...TV }, ANN)).toEqual({
      movieId: SHARED_ID,
      mediaType: "TV",
      undone: true,
    });
    expect(table.row(pk, `TALLY#1#tv:${SHARED_ID}`)?.likes).toBe(0);
    expect(table.row(pk, `TALLY#1#movie:${SHARED_ID}`)?.likes).toBe(1);
    expect(table.row(pk, `SWIPE#1#sub-ann#movie:${SHARED_ID}`)).toBeDefined();
  });

  it("won't undo a like a match stands on", async () => {
    await roomOf("ann", "bob");
    await swipe({ movieId: 1, direction: "LIKE", ...TV }, ANN);
    await swipe({ movieId: 1, direction: "LIKE", ...TV }, BOB);
    expect(await undoSwipe({ movieId: 1, ...TV }, ANN)).toMatchObject({ undone: false });
  });
});

describe("Keep Looking", () => {
  it("advances only the TV round, and tells the room which mode it was", async () => {
    const room = await roomOf("ann");
    await swipe({ movieId: 1, direction: "PASS" }, ANN);
    const updated = await startNewRound({ expectedRound: 1, ...TV }, ANN);
    expect(updated).toMatchObject({ round: 1, tvRound: 2 });
    expect(eventsOf("ROUND_RESET")).toEqual([
      expect.objectContaining({ mediaType: "TV", round: 2, roomId: room.id }),
    ]);
  });

  it("leaves the movie deck where it was, and the reverse", async () => {
    await roomOf("ann");
    vi.mocked(discoverShows).mockResolvedValue(page([1, 2]));
    await swipe({ movieId: 1, direction: "PASS", ...TV }, ANN);
    await swipe({ movieId: 1, direction: "PASS" }, ANN);

    await startNewRound({ expectedRound: 1 }, ANN);
    expect(await myRoom({}, ANN)).toMatchObject({ round: 2, tvRound: 1 });
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([2]);

    await startNewRound({ expectedRound: 1, ...TV }, ANN);
    expect(await myRoom({}, ANN)).toMatchObject({ round: 2, tvRound: 2 });
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([1, 2]);
  });

  it("makes a double press a no-op, on a first press and a later one", async () => {
    await roomOf("ann", "bob");
    await Promise.all([
      startNewRound({ expectedRound: 1, ...TV }, ANN),
      startNewRound({ expectedRound: 1, ...TV }, BOB),
    ]);
    expect((await myRoom({}, ANN)).tvRound).toBe(2);
    await startNewRound({ expectedRound: 2, ...TV }, ANN);
    await startNewRound({ expectedRound: 2, ...TV }, BOB);
    expect((await myRoom({}, ANN)).tvRound).toBe(3);
    expect(eventsOf("ROUND_RESET")).toHaveLength(2);
  });

  it("refuses a match from a round that has ended", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 1, direction: "LIKE", ...TV }, ANN);
    table.beforeTransaction(async (items) => {
      if (!items.some((item) => item.ConditionCheck?.ExpressionAttributeNames?.["#round"])) return false;
      await startNewRound({ expectedRound: 1, ...TV }, ANN);
      return true;
    });
    const { match } = await swipe({ movieId: 1, direction: "LIKE", ...TV }, BOB);
    expect(match).toBeNull();
    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toEqual([]);
  });
});

describe("the other mode's rows", () => {
  async function matchInBoth(): Promise<void> {
    await roomOf("ann", "bob");
    await swipe({ movieId: SHARED_ID, direction: "LIKE" }, ANN);
    await swipe({ movieId: SHARED_ID, direction: "LIKE" }, BOB);
    await swipe({ movieId: SHARED_ID, direction: "LIKE", ...TV }, ANN);
    await swipe({ movieId: SHARED_ID, direction: "LIKE", ...TV }, BOB);
  }

  it("keeps matches apart", async () => {
    await matchInBoth();
    const tv = await matches(TV, ANN);
    const movies = await matches({}, ANN);
    expect(tv.matches.map((match) => match.mediaType)).toEqual(["TV"]);
    expect(tv.matches[0]?.show).toEqual(showNamed(SHARED_ID));
    expect(movies.matches.map((match) => match.mediaType)).toEqual(["MOVIE"]);
  });

  it("pages one mode's matches without showing the other's", async () => {
    await roomOf("ann", "bob");
    for (const id of [1, 2, 3]) {
      await swipe({ movieId: id, direction: "LIKE", ...TV }, ANN);
      await swipe({ movieId: id, direction: "LIKE", ...TV }, BOB);
      await swipe({ movieId: id, direction: "LIKE" }, ANN);
      await swipe({ movieId: id, direction: "LIKE" }, BOB);
    }
    const first = await matches({ limit: 2, ...TV }, ANN);
    expect(first.matches).toHaveLength(2);
    const second = await matches({ limit: 2, nextToken: first.nextToken, ...TV }, ANN);
    expect(second.matches).toHaveLength(1);
    expect(second.nextToken).toBeNull();
    const ids = [...first.matches, ...second.matches].map((match) => match.movie.id);
    expect(new Set(ids)).toEqual(new Set([1, 2, 3]));
    expect([...first.matches, ...second.matches].every((match) => match.mediaType === "TV")).toBe(true);
  });

  it("refuses a token from another room", async () => {
    await roomOf("ann");
    const token = Buffer.from(JSON.stringify({ pk: "ROOM#other", sk: "MATCH#" })).toString("base64url");
    await expect(matches({ nextToken: token, ...TV }, ANN)).rejects.toBeInstanceOf(ValidationError);
  });

  it("keeps pending matches apart", async () => {
    await roomOf("ann", "bob");
    await swipe({ movieId: 1, direction: "LIKE", ...TV }, ANN);
    await swipe({ movieId: 1, direction: "LIKE", ...TV }, BOB);
    expect(await pendingMatch({}, ANN)).toBeNull();
    expect(await pendingMatch(TV, ANN)).toMatchObject({ mediaType: "TV" });
  });

  it("forgets a pending show after Keep Looking, whatever the movies do", async () => {
    await roomOf("ann", "bob");
    await swipe({ movieId: 1, direction: "LIKE", ...TV }, ANN);
    await swipe({ movieId: 1, direction: "LIKE", ...TV }, BOB);
    await startNewRound({ expectedRound: 1 }, ANN);
    expect(await pendingMatch(TV, ANN)).toMatchObject({ mediaType: "TV" });
    await startNewRound({ expectedRound: 1, ...TV }, ANN);
    expect(await pendingMatch(TV, ANN)).toBeNull();
  });

  it("keeps history apart", async () => {
    await roomOf("ann");
    await swipe({ movieId: 1, direction: "PASS" }, ANN);
    await swipe({ movieId: 2, direction: "LIKE", ...TV }, ANN);
    const tv = await swipeHistory(TV, ANN);
    expect(tv.entries).toEqual([
      expect.objectContaining({ mediaType: "TV", show: showNamed(2), direction: "LIKE", round: 1 }),
    ]);
    expect((await swipeHistory({}, ANN)).entries.map((entry) => entry.movie.id)).toEqual([1]);
  });
});

describe("changes that touch the whole room", () => {
  it("re-evaluates both modes when the threshold drops", async () => {
    await roomOf("ann", "bob", "cat");
    await updateRoomSettings({ matchThreshold: 3, requireMajority: false }, ANN);
    for (const person of [ANN, BOB]) {
      await swipe({ movieId: 1, direction: "LIKE" }, person);
      await swipe({ movieId: 2, direction: "LIKE", ...TV }, person);
    }
    expect(eventsOf("MATCH_FOUND")).toEqual([]);
    await updateRoomSettings({ matchThreshold: 2, requireMajority: false }, ANN);
    expect(eventsOf("MATCH_FOUND")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ mediaType: "MOVIE", movieId: 1 }),
        expect.objectContaining({ mediaType: "TV", movieId: 2 }),
      ]),
    );
    expect((await matches(TV, ANN)).matches[0]).toMatchObject({ show: showNamed(2) });
  });

  it("doesn't take a movie's match for the show with its number", async () => {
    await roomOf("ann", "bob", "cat");
    await updateRoomSettings({ matchThreshold: 3, requireMajority: false }, ANN);
    for (const person of [ANN, BOB, user("cat")]) {
      await swipe({ movieId: SHARED_ID, direction: "LIKE" }, person);
    }
    for (const person of [ANN, BOB]) {
      await swipe({ movieId: SHARED_ID, direction: "LIKE", ...TV }, person);
    }
    await updateRoomSettings({ matchThreshold: 2, requireMajority: false }, ANN);
    expect((await matches(TV, ANN)).matches).toHaveLength(1);
  });

  it("takes a leaver's likes out of both modes' rounds", async () => {
    const room = await roomOf("ann", "bob", "cat");
    const pk = `ROOM#${room.id}`;
    await startNewRound({ expectedRound: 1, ...TV }, ANN);
    await swipe({ movieId: SHARED_ID, direction: "LIKE" }, BOB);
    await swipe({ movieId: SHARED_ID, direction: "LIKE", ...TV }, BOB);
    await leaveRoom({}, BOB);
    expect(table.find(pk, "SWIPE#")).toEqual([]);
    expect(table.row(pk, `TALLY#1#movie:${SHARED_ID}`)?.likes).toBe(0);
    expect(table.row(pk, `TALLY#2#tv:${SHARED_ID}`)?.likes).toBe(0);
  });

  it("leaves the other round's rows alone when the rounds differ", async () => {
    const room = await roomOf("ann", "bob");
    const pk = `ROOM#${room.id}`;
    await swipe({ movieId: 1, direction: "LIKE", ...TV }, BOB);
    await startNewRound({ expectedRound: 1, ...TV }, ANN);
    await leaveRoom({}, BOB);
    expect(table.row(pk, "SWIPE#1#sub-bob#tv:1")).toBeDefined();
  });

  it("takes a bare-id like off the bare-id tally it was counted on", async () => {
    const room = await roomOf("ann", "bob");
    const pk = `ROOM#${room.id}`;
    table.seed({
      pk,
      sk: "SWIPE#1#sub-bob#550",
      movieId: 550,
      direction: "LIKE",
      swipedAt: "2026-01-01T00:00:00.000Z",
      movie: movieNamed(550),
    });
    table.seed({ pk, sk: "TALLY#1#550", movieId: 550, likes: 1, movie: movieNamed(550) });
    await leaveRoom({}, BOB);
    expect(table.row(pk, "TALLY#1#550")?.likes).toBe(0);
    expect(table.row(pk, "TALLY#1#movie:550")).toBeUndefined();
  });
});

describe("filters", () => {
  it("saves to tvFilters only, and says which mode changed", async () => {
    await roomOf("ann");
    const saved = await updateFilters(
      {
        filters: filtersWith({
          genreIds: [18],
          firstAirDateGte: "2020-01-01",
          showStatus: "FINISHED",
          commitment: "SHORT_AND_SWEET",
          releaseDateGte: "2000-01-01",
        }),
        ...TV,
      },
      ANN,
    );
    expect(saved.filters).toEqual(emptyFilters());
    expect(saved.tvFilters).toEqual({
      genreIds: [18],
      cast: [],
      services: [],
      firstAirDateGte: "2020-01-01",
      showStatus: "FINISHED",
      commitment: "SHORT_AND_SWEET",
    });
    expect(eventsOf("ROOM_UPDATED")).toEqual([expect.objectContaining({ mediaType: "TV" })]);
  });

  it("drops TV fields from a movie save", async () => {
    await roomOf("ann");
    const saved = await updateFilters(
      { filters: filtersWith({ commitment: "LONG_HAUL", releaseDateGte: "2000-01-01" }) },
      ANN,
    );
    expect(saved.filters).toEqual({ ...emptyFilters(), releaseDateGte: "2000-01-01" });
  });

  it("refuses a malformed first-air date", async () => {
    await roomOf("ann");
    await expect(
      updateFilters({ filters: filtersWith({ firstAirDateGte: "soon" }), ...TV }, ANN),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("the deck", () => {
  it("deals shows with a movie face, and only from TV filters", async () => {
    await roomOf("ann");
    await updateFilters({ filters: filtersWith({ genreIds: [18] }), ...TV }, ANN);
    await updateFilters({ filters: filtersWith({ genreIds: [35] }) }, ANN);
    vi.mocked(discoverShows).mockResolvedValue(page([1]));
    const result = await deck({ page: 1, ...TV }, ANN);
    expect(result.cards).toEqual([
      { mediaType: "TV", movie: showAsMovie(showNamed(1)), show: showNamed(1) },
    ]);
    expect(vi.mocked(discoverShows).mock.calls[0]?.[0].genreIds).toEqual([18]);
  });

  it("doesn't hide a show because its number was swiped as a movie", async () => {
    await roomOf("ann");
    await swipe({ movieId: SHARED_ID, direction: "PASS" }, ANN);
    vi.mocked(discoverShows).mockResolvedValue(page([SHARED_ID]));
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([SHARED_ID]);
  });

  it("hides shows already swiped, and a roommate's like moves nothing", async () => {
    await roomOf("ann", "bob");
    await swipe({ movieId: 3, direction: "PASS", ...TV }, ANN);
    await swipe({ movieId: 9, direction: "LIKE", ...TV }, BOB);
    vi.mocked(discoverShows).mockResolvedValue(page([1, 3, 9]));
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([1, 9]);
  });

  it("drops shows with no poster", async () => {
    await roomOf("ann");
    shows.set(1, showNamed(1, { posterUrl: null }));
    vi.mocked(discoverShows).mockResolvedValue(page([1, 2]));
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([2]);
  });

  it("checks status on the hydrated show too", async () => {
    await roomOf("ann");
    await updateFilters({ filters: filtersWith({ showStatus: "RUNNING" }), ...TV }, ANN);
    shows.set(1, showNamed(1, { status: "Returning Series" }));
    shows.set(2, showNamed(2, { status: "Canceled" }));
    vi.mocked(discoverShows).mockResolvedValue(page([1, 2]));
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([1]);
  });
});

describe("Commitment Level", () => {
  beforeEach(async () => {
    await roomOf("ann");
    await updateFilters({ filters: filtersWith({ commitment: "LONG_HAUL" }), ...TV }, ANN);
    vi.mocked(discoverShows).mockImplementation(async (_filters, pageNumber) =>
      page(range(pageNumber * 100, 20), 500),
    );
  });

  it("applies after hydrating, and walks deeper for a useful hand", async () => {
    shows = new Map(range(100, 900).map((id) => [id, showNamed(id, { seasonCount: 2 })]));
    for (const id of [101, 201, 301, 401, 501, 601, 701, 801, 901, 1001, 1101]) {
      shows.set(id, showNamed(id, { seasonCount: 9 }));
    }
    shows.set(102, showNamed(102, { seasonCount: null }));
    const result = await deck({ page: 1, ...TV }, ANN);
    expect(dealtIds(result)).toEqual([101, 201, 301, 401, 501, 601, 701, 801, 901, 1001]);
    expect(result.nextPage).toBe(11);
  });

  it("gives up after 15 pages and says there's more", async () => {
    shows = new Map(range(100, 2000).map((id) => [id, showNamed(id, { seasonCount: 2 })]));
    const result = await deck({ page: 1, ...TV }, ANN);
    expect(result).toEqual({ cards: [], nextPage: 16 });
    expect(discoverShows).toHaveBeenCalledTimes(15);
  });

  it("starts no page past the time budget, however few cards it has", async () => {
    shows = new Map(range(100, 2000).map((id) => [id, showNamed(id, { seasonCount: 2 })]));
    let now = Date.now();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    vi.mocked(hydrateShows).mockImplementation(async (ids) => {
      if (ids.length > 0) now += 4_000;
      return ids.map(showFor);
    });
    const result = await deck({ page: 1, ...TV }, ANN);
    expect(discoverShows).toHaveBeenCalledTimes(3);
    expect(result).toEqual({ cards: [], nextPage: 4 });
  });

  it("tells hydration when to stop, inside AppSync's 30 seconds", async () => {
    const before = Date.now();
    shows = new Map(range(100, 2000).map((id) => [id, showNamed(id, { seasonCount: 7 })]));
    await deck({ page: 1, ...TV }, ANN);
    const stopAt = vi.mocked(hydrateShows).mock.calls[0]?.[1] ?? 0;
    expect(stopAt - before).toBeGreaterThanOrEqual(20_000);
    expect(stopAt - before).toBeLessThan(25_000);
  });

  it("hands over what it has when TMDB fails partway, and picks up at that page", async () => {
    shows = new Map(range(100, 2000).map((id) => [id, showNamed(id, { seasonCount: id === 101 ? 9 : 2 })]));
    vi.mocked(discoverShows).mockImplementation(async (_filters, pageNumber) => {
      if (pageNumber === 3) throw new UpstreamError();
      return page(range(pageNumber * 100, 20), 500);
    });
    expect(await deck({ page: 1, ...TV }, ANN)).toMatchObject({ nextPage: 3, cards: [{ movie: { id: 101 } }] });
  });

  it("still reports a failure when there's nothing to hand over", async () => {
    vi.mocked(discoverShows).mockRejectedValue(new UpstreamError());
    await expect(deck({ page: 1, ...TV }, ANN)).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("the actor filter", () => {
  const CRANSTON = { id: 17419, name: "Bryan Cranston" };

  beforeEach(async () => {
    await roomOf("ann");
  });

  async function givenActorFilters(overrides: Partial<Filters> = {}): Promise<void> {
    await updateFilters({ filters: filtersWith({ cast: [CRANSTON], ...overrides }), ...TV }, ANN);
  }

  it("deals from credits and never asks discover/tv", async () => {
    await givenActorFilters();
    vi.mocked(getActorShows).mockResolvedValue([credit(1), credit(2)]);
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([1, 2]);
    expect(getActorShows).toHaveBeenCalledWith(CRANSTON.id);
    expect(discoverShows).not.toHaveBeenCalled();
  });

  it("puts real roles ahead of guest spots", async () => {
    await givenActorFilters();
    vi.mocked(getActorShows).mockResolvedValue([
      credit(1, { episodeCount: 1, popularity: 900 }),
      credit(2, { episodeCount: 62 }),
    ]);
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([2, 1]);
  });

  it("intersects with genre, first-air dates, language and poster", async () => {
    await givenActorFilters({ genreIds: [35], firstAirDateGte: "2000-01-01", firstAirDateLte: "2010-12-31" });
    vi.mocked(getActorShows).mockResolvedValue([
      credit(1, { genreIds: [35], firstAirDate: "2005-06-01" }),
      credit(2, { genreIds: [18], firstAirDate: "2005-06-01" }),
      credit(3, { genreIds: [35], firstAirDate: "1999-06-01" }),
      credit(4, { genreIds: [35], firstAirDate: null }),
      credit(5, { genreIds: [35], firstAirDate: "2005-06-01", originalLanguage: "ko" }),
      credit(6, { genreIds: [35], firstAirDate: "2005-06-01", hasPoster: false }),
    ]);
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([1]);
  });

  it("drops the news and chat shows the deck hides", async () => {
    await givenActorFilters();
    vi.mocked(getActorShows).mockResolvedValue([credit(1, { genreIds: [10767, 35] }), credit(2)]);
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([2]);
  });

  it("intersects with services through each show's details", async () => {
    await givenActorFilters({ services: ["netflix"] });
    vi.mocked(getActorShows).mockResolvedValue(range(1, 6).map((id) => credit(id)));
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([2, 4, 6]);
  });

  it("intersects with status and commitment after hydrating", async () => {
    await givenActorFilters({ showStatus: "FINISHED", commitment: "SHORT_AND_SWEET" });
    shows.set(1, showNamed(1, { status: "Ended", seasonCount: 1 }));
    shows.set(2, showNamed(2, { status: "Ended", seasonCount: 8 }));
    shows.set(3, showNamed(3, { status: "Returning Series", seasonCount: 1 }));
    vi.mocked(getActorShows).mockResolvedValue([credit(1), credit(2), credit(3)]);
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([1]);
  });

  it("unions several actors, as the movie deck does, without repeating a shared show", async () => {
    await updateFilters(
      { filters: filtersWith({ cast: [CRANSTON, { id: 84497, name: "Aaron Paul" }] }), ...TV },
      ANN,
    );
    vi.mocked(getActorShows).mockImplementation(async (id) =>
      id === CRANSTON.id ? [credit(1), credit(2, { episodeCount: 5 })] : [credit(1, { episodeCount: 50 }), credit(3)],
    );
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN)).sort()).toEqual([1, 2, 3]);
  });

  it("pages through a long career", async () => {
    await givenActorFilters();
    vi.mocked(getActorShows).mockResolvedValue(range(1, 45).map((id) => credit(id, { popularity: 100 - id })));
    const first = await deck({ page: 1, ...TV }, ANN);
    expect(first.cards).toHaveLength(20);
    expect(first.nextPage).toBe(2);
    const last = await deck({ page: 3, ...TV }, ANN);
    expect(last.cards).toHaveLength(5);
    expect(last.nextPage).toBeNull();
  });
});

describe("the Plex filter", () => {
  const LINKED = { plexUserId: "plex-1", plexEmail: "ann@example.com" };

  async function linkAnn(): Promise<void> {
    await roomOf("ann");
    const row = table.row("USER#sub-ann", "PROFILE");
    if (!row) throw new Error("No profile");
    table.seed({ ...row, ...LINKED });
  }

  it("deals library shows even though every hasFile is false today", async () => {
    await linkAnn();
    givenShowIndex([libraryShow(1), libraryShow(2)]);
    await updateFilters({ filters: filtersWith({ services: ["plex"] }), ...TV }, ANN);
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([1, 2]);
    expect(discoverShows).not.toHaveBeenCalled();
  });

  it("believes hasFile once any show has one", async () => {
    await linkAnn();
    givenShowIndex([libraryShow(1, { hasFile: true }), libraryShow(2)]);
    await updateFilters({ filters: filtersWith({ services: ["plex"] }), ...TV }, ANN);
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([1]);
  });

  it("applies every TV filter to the index", async () => {
    await linkAnn();
    givenShowIndex([
      libraryShow(1, { genreIds: [18], seasonCount: 2, status: "Ended", firstAirDate: "2015-01-01", castIds: [287] }),
      libraryShow(2, { genreIds: [35] }),
      libraryShow(3, { seasonCount: 9 }),
      libraryShow(4, { status: "Returning Series" }),
      libraryShow(5, { firstAirDate: "1999-01-01" }),
      libraryShow(6, { castIds: [] }),
    ]);
    await updateFilters(
      {
        filters: filtersWith({
          services: ["plex"],
          genreIds: [18],
          commitment: "SHORT_AND_SWEET",
          showStatus: "FINISHED",
          firstAirDateGte: "2000-01-01",
          cast: [{ id: 287, name: "Brad Pitt" }],
        }),
        ...TV,
      },
      ANN,
    );
    shows.set(1, showNamed(1, { seasonCount: 2 }));
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([1]);
  });

  it("mixes with streaming without repeating a show on both", async () => {
    await linkAnn();
    givenShowIndex([libraryShow(1)]);
    await updateFilters({ filters: filtersWith({ services: ["plex", "netflix"] }), ...TV }, ANN);
    vi.mocked(discoverShows).mockResolvedValue(page([1, 2]));
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([1, 2]);
  });

  it("deals as if unset before the first index", async () => {
    await linkAnn();
    await updateFilters({ filters: filtersWith({ services: ["plex"] }), ...TV }, ANN);
    vi.mocked(discoverShows).mockResolvedValue(page([7]));
    expect(dealtIds(await deck({ page: 1, ...TV }, ANN))).toEqual([7]);
  });

  it("reports a show the index has without offering a request", async () => {
    await linkAnn();
    givenShowIndex([libraryShow(1)]);
    expect(await plexStatus({ movieId: 1, ...TV }, ANN)).toEqual({ availability: "AVAILABLE", canRequest: false });
  });

  it("calls a library show waiting on a file monitored once hasFile works", async () => {
    await linkAnn();
    givenShowIndex([libraryShow(1, { hasFile: true }), libraryShow(2)]);
    expect((await plexStatus({ movieId: 2, ...TV }, ANN))?.availability).toBe("MONITORED");
  });

  it("is null for someone who hasn't linked", async () => {
    await roomOf("ann");
    givenShowIndex([libraryShow(1)]);
    expect(await plexStatus({ movieId: 1, ...TV }, ANN)).toBeNull();
  });

  it("puts Plex first in Where to Watch for a show on it", async () => {
    await linkAnn();
    givenShowIndex([libraryShow(1)]);
    vi.mocked(getWatchOptions).mockResolvedValue([]);
    const options = await watchOptions({ movieId: 1, ...TV }, ANN);
    expect(options.map((option) => option.serviceId)).toEqual(["plex"]);
    expect(getWatchOptions).toHaveBeenCalledWith(1, ANN.userId, "TV");
    expect(await watchOptions({ movieId: 2, ...TV }, ANN)).toEqual([]);
  });
});

describe("limits on walking TMDB", () => {
  beforeEach(async () => {
    await roomOf("ann");
    vi.mocked(discoverShows).mockResolvedValue(page(range(1, 20), 1));
  });

  const longHaul = async (): Promise<void> => {
    await updateFilters({ filters: filtersWith({ commitment: "LONG_HAUL" }), ...TV }, ANN);
  };

  it("stops one person's sparse walks at the minute's limit, before they reach TMDB", async () => {
    await longHaul();
    for (let call = 0; call < USER_DECK_WALKS_PER_MINUTE; call += 1) await deck({ page: 1, ...TV }, ANN);
    vi.mocked(discoverShows).mockClear();
    await expect(deck({ page: 1, ...TV }, ANN)).rejects.toBeInstanceOf(RateLimitedError);
    expect(discoverShows).not.toHaveBeenCalled();
  });

  it("doesn't count a plain deck", async () => {
    for (let call = 0; call <= USER_DECK_WALKS_PER_MINUTE; call += 1) await deck({ page: 1, ...TV }, ANN);
  });

  it("lets only so many sparse walks run at once, whoever's asking, and frees the place after", async () => {
    await longHaul();
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    vi.mocked(discoverShows).mockImplementation(async () => {
      await held;
      return page(range(1, 20), 1);
    });
    const running = range(0, MAX_ACTIVE_DECK_WALKS).map(() => deck({ page: 1, ...TV }, ANN));
    await vi.waitFor(() => expect(discoverShows).toHaveBeenCalledTimes(MAX_ACTIVE_DECK_WALKS));

    await expect(deck({ page: 1, ...TV }, ANN)).rejects.toBeInstanceOf(RateLimitedError);

    release();
    await Promise.all(running);
    await expect(deck({ page: 1, ...TV }, ANN)).resolves.toBeDefined();
  });

  it("frees the place when a walk fails", async () => {
    await longHaul();
    vi.mocked(discoverShows).mockRejectedValue(new UpstreamError());
    for (let call = 0; call <= MAX_ACTIVE_DECK_WALKS; call += 1) {
      await expect(deck({ page: 1, ...TV }, ANN)).rejects.toBeInstanceOf(UpstreamError);
    }
  });

  it("caps sparse walks across everyone for the hour", async () => {
    await longHaul();
    table.seed({
      ...globalLimit("tmdb-walk", new Date().toISOString().slice(0, 13)),
      count: GLOBAL_WALKS_PER_HOUR,
    });
    await expect(deck({ page: 1, ...TV }, ANN)).rejects.toBeInstanceOf(RateLimitedError);
  });

  it("limits previews in both modes", async () => {
    for (let call = 0; call < USER_PREVIEWS_PER_MINUTE; call += 1) {
      await filterPreview({ filters: emptyFilters(), mediaType: call % 2 === 0 ? "TV" : "MOVIE" }, ANN);
    }
    await expect(filterPreview({ filters: emptyFilters(), ...TV }, ANN)).rejects.toBeInstanceOf(RateLimitedError);
    await expect(filterPreview({ filters: emptyFilters() }, ANN)).rejects.toBeInstanceOf(RateLimitedError);
  });
});

describe("filterPreview", () => {
  beforeEach(async () => {
    await roomOf("ann");
  });

  it("counts and shows what TMDB finds", async () => {
    vi.mocked(discoverShows).mockResolvedValue(page(range(1, 20), 3, 60));
    const preview = await filterPreview({ filters: emptyFilters(), ...TV }, ANN);
    expect(preview.totalResults).toBe(60);
    expect(preview.posterUrls).toHaveLength(5);
    expect(vi.mocked(hydrateShows).mock.calls[0]?.[0]).toHaveLength(8);
  });

  it("gives no count for Commitment Level, and posters only of shows that pass", async () => {
    shows = new Map(range(1, 40).map((id) => [id, showNamed(id, { seasonCount: 2 })]));
    shows.set(23, showNamed(23, { seasonCount: 9 }));
    vi.mocked(discoverShows).mockImplementation(async (_filters, pageNumber) =>
      page(range((pageNumber - 1) * 20 + 1, 20), 2),
    );
    const preview = await filterPreview(
      { filters: filtersWith({ commitment: "LONG_HAUL" }), ...TV },
      ANN,
    );
    expect(preview).toEqual({ totalResults: null, posterUrls: [showNamed(23).posterUrl] });
  });

  it("looks at no more than three pages", async () => {
    shows = new Map(range(1, 200).map((id) => [id, showNamed(id, { seasonCount: 2 })]));
    vi.mocked(discoverShows).mockImplementation(async (_filters, pageNumber) =>
      page(range((pageNumber - 1) * 20 + 1, 20), 9),
    );
    await filterPreview({ filters: filtersWith({ commitment: "LONG_HAUL" }), ...TV }, ANN);
    expect(discoverShows).toHaveBeenCalledTimes(3);
  });

  it("counts an actor's shows, unless a filter only details can answer is on", async () => {
    vi.mocked(getActorShows).mockResolvedValue([credit(1), credit(2)]);
    const cast = [{ id: 17419, name: "Bryan Cranston" }];
    expect((await filterPreview({ filters: filtersWith({ cast }), ...TV }, ANN)).totalResults).toBe(2);
    expect(
      (await filterPreview({ filters: filtersWith({ cast, showStatus: "FINISHED" }), ...TV }, ANN)).totalResults,
    ).toBeNull();
    expect(
      (await filterPreview({ filters: filtersWith({ cast, services: ["netflix"] }), ...TV }, ANN)).totalResults,
    ).toBeNull();
  });

  it("keeps TV fields a save would keep", async () => {
    await filterPreview({ filters: filtersWith({ showStatus: "RUNNING" }), ...TV }, ANN);
    expect(vi.mocked(discoverShows).mock.calls[0]?.[0].showStatus).toBe("RUNNING");
  });
});

describe("catalogue fields", () => {
  it("routes genres and trailers by mode", async () => {
    vi.mocked(getTvGenres).mockResolvedValue([{ id: 10765, name: "Sci-Fi & Fantasy" }]);
    vi.mocked(getShowTrailerKey).mockResolvedValue("abc");
    expect(await genres(TV)).toEqual([{ id: 10765, name: "Sci-Fi & Fantasy" }]);
    expect(await trailer({ movieId: 1399, ...TV })).toBe("abc");
    expect(getShowTrailerKey).toHaveBeenCalledWith(1399);
  });
});
