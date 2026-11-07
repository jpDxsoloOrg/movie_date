import { GetCommand, QueryCommand } from "@aws-sdk/lib-dynamodb";
import type { Filters, Movie } from "@movie-date/core";
import { deck } from "@movie-date/functions/handlers/deck";
import { getClient } from "@movie-date/functions/lib/db";
import { NotFoundError, UpstreamError, ValidationError } from "@movie-date/functions/lib/errors";
import {
  discoverMovies,
  hydrateMovies,
  type DiscoverPage,
} from "@movie-date/functions/lib/tmdb";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@movie-date/functions/lib/tmdb");

const dynamo = mockClient(getClient());
const CALLER = { userId: "me" };
const ROOM_ID = "room1";
const ROUND = 3;

function movieFixture(id: number, overrides: Partial<Movie> = {}): Movie {
  return {
    id,
    title: `Movie ${id}`,
    overview: "",
    releaseYear: 2024,
    runtime: 100,
    voteAverage: 7,
    posterUrl: `https://img/${id}.jpg`,
    backdropUrl: null,
    genres: [],
    ...overrides,
  };
}

function discoverPage(ids: number[], totalPages = 10): DiscoverPage {
  return {
    totalPages,
    totalResults: ids.length * totalPages,
    results: ids.map((id) => ({ id, originalLanguage: "en", hasPoster: true })),
  };
}

interface RoomFixture {
  filters?: Filters;
  swipedIds?: number[];
  /** Present to prove the deck ignores them: it never queries these rows. */
  tallies?: { movieId: number; likes: number }[];
  matched?: { media: string; cleared: boolean }[];
}

function givenRoom({ filters, swipedIds = [], tallies = [], matched = [] }: RoomFixture = {}): void {
  dynamo.on(GetCommand, { Key: { pk: "USER#me", sk: "PROFILE" } }).resolves({
    Item: { pk: "USER#me", sk: "PROFILE", roomId: ROOM_ID },
  });
  dynamo.on(GetCommand, { Key: { pk: `ROOM#${ROOM_ID}`, sk: "META" } }).resolves({
    Item: { pk: `ROOM#${ROOM_ID}`, sk: "META", round: ROUND, ...(filters ? { filters } : {}) },
  });
  dynamo.on(QueryCommand).callsFake((input: { ExpressionAttributeValues: { ":sk": string } }) => {
    const prefix = input.ExpressionAttributeValues[":sk"];
    if (prefix === `SWIPE#${ROUND}#me#`) {
      return { Items: swipedIds.map((id) => ({ sk: `${prefix}movie:${id}`, direction: "PASS" })) };
    }
    if (prefix === `TALLY#${ROUND}#`) {
      return {
        Items: tallies.map(({ movieId, likes }) => ({ sk: `${prefix}movie:${movieId}`, likes })),
      };
    }
    if (prefix === `MATCHED#${ROUND}#`) {
      return {
        Items: matched.map(({ media, cleared }) => ({
          sk: `${prefix}${media}`,
          ...(cleared ? { clearedAt: "2026-01-01T00:00:00.000Z" } : {}),
        })),
      };
    }
    throw new Error(`Unexpected query: ${prefix}`);
  });
}

function cardIds(page: { cards: { movie: Movie }[] }): number[] {
  return page.cards.map((card) => card.movie.id);
}

beforeEach(() => {
  dynamo.reset();
  vi.mocked(hydrateMovies).mockImplementation(async (ids) => ids.map((id) => movieFixture(id)));
});

afterEach(() => {
  vi.resetAllMocks();
});

describe("deck paging", () => {
  it("rejects a page below 1", async () => {
    await expect(deck({ page: 0 }, CALLER)).rejects.toBeInstanceOf(ValidationError);
  });

  it("fails clearly when the caller has no room yet", async () => {
    dynamo.on(GetCommand).resolves({});
    await expect(deck({ page: 1 }, CALLER)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deals a page and points at the next one", async () => {
    givenRoom();
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1, 2]));
    const result = await deck({ page: 2 }, CALLER);
    expect(cardIds(result)).toEqual([1, 2]);
    expect(result.nextPage).toBe(3);
  });

  it("falls back to no filters on a room that never set any", async () => {
    givenRoom();
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1]));
    await deck({ page: 1 }, CALLER);
    expect(discoverMovies).toHaveBeenCalledWith(
      { genreIds: [], cast: [], services: [] },
      1,
    );
  });

  it("uses the room's filters", async () => {
    const filters: Filters = { genreIds: [28], cast: [], services: ["netflix"] };
    givenRoom({ filters });
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1]));
    await deck({ page: 1 }, CALLER);
    expect(discoverMovies).toHaveBeenCalledWith(filters, 1);
  });

  it("has no next page on TMDB's last page", async () => {
    givenRoom();
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1], 4));
    expect((await deck({ page: 4 }, CALLER)).nextPage).toBeNull();
  });

  it("stops at TMDB's page 500 even when total_pages says more", async () => {
    givenRoom();
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1], 1001));
    expect((await deck({ page: 500 }, CALLER)).nextPage).toBeNull();
    expect(await deck({ page: 501 }, CALLER)).toEqual({ cards: [], nextPage: null });
  });

  it("reports the end of the deck for an empty result", async () => {
    givenRoom();
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([], 0));
    expect(await deck({ page: 1 }, CALLER)).toEqual({ cards: [], nextPage: null });
  });
});

describe("what gets excluded", () => {
  it("drops anything swiped this round", async () => {
    givenRoom({ swipedIds: [1] });
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1, 2]));
    expect(cardIds(await deck({ page: 1 }, CALLER))).toEqual([2]);
  });

  it("drops other languages without hydrating them", async () => {
    givenRoom();
    vi.mocked(discoverMovies).mockResolvedValue({
      totalPages: 1,
      totalResults: null,
      results: [
        { id: 1, originalLanguage: "ko", hasPoster: true },
        { id: 2, originalLanguage: "en", hasPoster: true },
      ],
    });
    expect(cardIds(await deck({ page: 1 }, CALLER))).toEqual([2]);
    expect(hydrateMovies).toHaveBeenLastCalledWith([2]);
  });

  it("drops a movie with no poster in discover or in its details", async () => {
    givenRoom();
    vi.mocked(discoverMovies).mockResolvedValue({
      totalPages: 1,
      totalResults: null,
      results: [
        { id: 1, originalLanguage: "en", hasPoster: false },
        { id: 2, originalLanguage: "en", hasPoster: true },
        { id: 3, originalLanguage: "en", hasPoster: true },
      ],
    });
    vi.mocked(hydrateMovies).mockResolvedValue([
      movieFixture(2, { posterUrl: null }),
      movieFixture(3),
    ]);
    expect(cardIds(await deck({ page: 1 }, CALLER))).toEqual([3]);
  });

  it("deals a repeated TMDB result once", async () => {
    givenRoom();
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1, 1, 2]));
    expect(cardIds(await deck({ page: 1 }, CALLER))).toEqual([1, 2]);
  });

  it("reads swipes consistently, since the client reloads right after swiping", async () => {
    givenRoom();
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1]));
    await deck({ page: 1 }, CALLER);
    for (const call of dynamo.commandCalls(QueryCommand)) {
      expect(call.args[0].input.ConsistentRead).toBe(true);
    }
  });
});

describe("walking forward past an emptied page", () => {
  it("returns the first page that has cards and continues after it", async () => {
    givenRoom({ swipedIds: [1, 2] });
    vi.mocked(discoverMovies)
      .mockResolvedValueOnce(discoverPage([1]))
      .mockResolvedValueOnce(discoverPage([2]))
      .mockResolvedValueOnce(discoverPage([3]));
    const result = await deck({ page: 1 }, CALLER);
    expect(cardIds(result)).toEqual([3]);
    expect(result.nextPage).toBe(4);
  });

  it("gives up after 5 further pages but says there's more", async () => {
    givenRoom({ swipedIds: [1] });
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1], 100));
    expect(await deck({ page: 1 }, CALLER)).toEqual({ cards: [], nextPage: 7 });
    expect(discoverMovies).toHaveBeenCalledTimes(6);
  });

  it("stops at the end of TMDB's results", async () => {
    givenRoom({ swipedIds: [1] });
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1], 2));
    expect(await deck({ page: 1 }, CALLER)).toEqual({ cards: [], nextPage: null });
    expect(discoverMovies).toHaveBeenCalledTimes(2);
  });

  it("surfaces an outage rather than an empty deck", async () => {
    givenRoom();
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1]));
    vi.mocked(hydrateMovies).mockRejectedValue(new UpstreamError());
    await expect(deck({ page: 1 }, CALLER)).rejects.toBeInstanceOf(UpstreamError);
  });
});

describe("what the room has done", () => {
  it("deals the same cards in the same order whatever anyone liked", async () => {
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1, 2, 3]));
    givenRoom();
    const untouched = await deck({ page: 1 }, CALLER);
    dynamo.reset();
    givenRoom({ tallies: [{ movieId: 3, likes: 2 }, { movieId: 99, likes: 5 }] });
    expect(await deck({ page: 1 }, CALLER)).toEqual(untouched);
    expect(cardIds(untouched)).toEqual([1, 2, 3]);
  });

  it("doesn't read the tallies at all", async () => {
    givenRoom();
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1]));
    await deck({ page: 1 }, CALLER);
    const prefixes = dynamo.commandCalls(QueryCommand).map((call) => call.args[0].input.ExpressionAttributeValues?.[":sk"]);
    expect(prefixes.some((prefix) => String(prefix).startsWith("TALLY#"))).toBe(false);
  });

  it("puts nothing about likes on a card", async () => {
    givenRoom({ tallies: [{ movieId: 1, likes: 1 }] });
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1]));
    const [card] = (await deck({ page: 1 }, CALLER)).cards;
    expect(card).not.toHaveProperty("likedByRoommate");
  });

  it("hides a cleared match but not one still standing", async () => {
    givenRoom({ matched: [{ media: "movie:1", cleared: true }, { media: "movie:2", cleared: false }] });
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1, 2, 3]));
    expect(cardIds(await deck({ page: 1 }, CALLER))).toEqual([2, 3]);
  });

  it("doesn't hide a movie because the show with its number was cleared", async () => {
    givenRoom({ matched: [{ media: "tv:1", cleared: true }] });
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1]));
    expect(cardIds(await deck({ page: 1 }, CALLER))).toEqual([1]);
  });
});
