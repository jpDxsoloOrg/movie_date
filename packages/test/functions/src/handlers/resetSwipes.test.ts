import { deck } from "@movie-date/functions/handlers/deck";
import { matches } from "@movie-date/functions/handlers/matches";
import { resetSwipes } from "@movie-date/functions/handlers/resetSwipes";
import { swipe } from "@movie-date/functions/handlers/swipe";
import { swipeHistory } from "@movie-date/functions/handlers/swipeHistory";
import { publishRoomEvent } from "@movie-date/functions/lib/events";
import { discoverMovies, hydrateMovies } from "@movie-date/functions/lib/tmdb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { movieNamed, roomOf, user } from "../support/roomFixture";

vi.mock("@movie-date/functions/lib/events", () => ({
  publishRoomEvent: vi.fn(),
  revokeRoomSubscriptions: async () => undefined,
}));
vi.mock("@movie-date/functions/lib/tmdb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/tmdb")>()),
  getMovie: async (id: number) => movieNamed(id),
  discoverMovies: vi.fn(),
  hydrateMovies: vi.fn(),
}));

const ANN = user("ann");

let table: FakeDynamo;

async function dealt(context = ANN): Promise<number[]> {
  return (await deck({ page: 1 }, context)).cards.map((card) => card.movie.id);
}

/** Timestamps have millisecond resolution, and the reset must land after the swipes. */
async function tick(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 3));
}

beforeEach(() => {
  table = new FakeDynamo();
  vi.mocked(discoverMovies).mockResolvedValue({
    totalPages: 1,
    totalResults: 3,
    results: [1, 2, 3].map((id) => ({ id, originalLanguage: "en", hasPoster: true })),
  });
  vi.mocked(hydrateMovies).mockImplementation(async (ids) =>
    ids.map((id) => ({ ...movieNamed(id), posterUrl: `https://img/${id}.jpg` })),
  );
});

afterEach(() => {
  table.restore();
  vi.clearAllMocks();
});

describe("resetSwipes", () => {
  it("puts every swiped title back in the deck of someone alone, and empties their list", async () => {
    const before = await roomOf("ann");
    await swipe({ movieId: 1, direction: "LIKE" }, ANN);
    await swipe({ movieId: 2, direction: "PASS" }, ANN);
    expect(await dealt()).toEqual([3]);
    const matchesBefore = (await matches({}, ANN)).matches.length;
    await tick();

    const room = await resetSwipes({}, ANN);

    expect(room.round).toBe(before.round + 1);
    expect(room.tvRound).toBe(before.tvRound);
    expect((await dealt()).sort()).toEqual([1, 2, 3]);
    expect((await swipeHistory({}, ANN)).entries).toEqual([]);
    // Matches already made aren't swipes, so they stay.
    expect((await matches({}, ANN)).matches).toHaveLength(matchesBefore);
    expect(publishRoomEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: "ROUND_RESET", mediaType: "MOVIE", round: room.round }),
    );
  });

  it("only moves the mode it was asked for", async () => {
    const before = await roomOf("ann");
    const room = await resetSwipes({ mediaType: "TV" }, ANN);
    expect(room.tvRound).toBe(before.tvRound + 1);
    expect(room.round).toBe(before.round);
  });

  it("is refused with anyone else in the room, and changes nothing", async () => {
    const before = await roomOf("ann", "bob");
    await swipe({ movieId: 1, direction: "PASS" }, ANN);

    await expect(resetSwipes({}, ANN)).rejects.toThrow("only one in the room");
    expect(await dealt()).toEqual([2, 3]);
    expect((await swipeHistory({}, ANN)).entries).toHaveLength(1);
    expect((await roomOf("ann")).round).toBe(before.round);
    expect(publishRoomEvent).not.toHaveBeenCalledWith(expect.objectContaining({ type: "ROUND_RESET" }));
  });
});
