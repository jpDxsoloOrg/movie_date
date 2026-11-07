import { clearHistory } from "@movie-date/functions/handlers/clearHistory";
import { deck } from "@movie-date/functions/handlers/deck";
import { joinRoom } from "@movie-date/functions/handlers/joinRoom";
import { matches } from "@movie-date/functions/handlers/matches";
import { pendingMatch } from "@movie-date/functions/handlers/pendingMatch";
import { swipe } from "@movie-date/functions/handlers/swipe";
import { swipeHistory } from "@movie-date/functions/handlers/swipeHistory";
import { undoSwipe } from "@movie-date/functions/handlers/undoSwipe";
import { discoverMovies, hydrateMovies } from "@movie-date/functions/lib/tmdb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { movieNamed, roomOf, user } from "../support/roomFixture";

vi.mock("@movie-date/functions/lib/events", () => ({
  publishRoomEvent: vi.fn(),
  revokeRoomSubscriptions: async () => undefined,
}));
const TITLES: Record<number, string> = { 1: "Amélie", 2: "Heat", 3: "Heathers" };
vi.mock("@movie-date/functions/lib/tmdb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/tmdb")>()),
  getMovie: async (id: number) => ({ ...movieNamed(id), title: TITLES[id] ?? `Movie ${id}` }),
  discoverMovies: vi.fn(),
  hydrateMovies: vi.fn(),
}));

const ANN = user("ann");
const BOB = user("bob");
const CARL = user("carl");

let table: FakeDynamo;

async function matchOn(movieId: number): Promise<void> {
  await swipe({ movieId, direction: "LIKE" }, ANN);
  await swipe({ movieId, direction: "LIKE" }, BOB);
}

async function matchTitles(context = ANN, search?: string): Promise<string[]> {
  return (await matches({ search }, context)).matches.map((match) => match.movie.title);
}

async function swipeTitles(args: Parameters<typeof swipeHistory>[0] = {}, context = ANN): Promise<string[]> {
  return (await swipeHistory(args, context)).entries.map((entry) => entry.movie.title);
}

/** Timestamps have millisecond resolution, and a clear must land after what it clears. */
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

describe("filtering history", () => {
  beforeEach(async () => {
    await roomOf("ann", "bob");
    await matchOn(1);
    await matchOn(2);
    await tick();
    await swipe({ movieId: 3, direction: "PASS" }, ANN);
  });

  it("finds matches by title, ignoring case and accents", async () => {
    expect(await matchTitles(ANN, "HEAT")).toEqual(["Heat"]);
    expect(await matchTitles(ANN, "  amelie ")).toEqual(["Amélie"]);
    expect(await matchTitles(ANN, "nothing")).toEqual([]);
  });

  it("filters swipes by title and direction together", async () => {
    expect((await swipeTitles({ search: "heat" })).sort()).toEqual(["Heat", "Heathers"]);
    expect(await swipeTitles({ search: "heat", direction: "PASS" })).toEqual(["Heathers"]);
    expect((await swipeTitles({ direction: "LIKE" })).sort()).toEqual(["Amélie", "Heat"]);
  });

  it("pages within the filtered list", async () => {
    const first = await swipeHistory({ limit: 1, direction: "LIKE" }, ANN);
    expect(first.entries).toHaveLength(1);
    const second = await swipeHistory({ limit: 1, direction: "LIKE", nextToken: first.nextToken }, ANN);
    expect(second.entries).toHaveLength(1);
    expect(second.nextToken).toBeNull();
  });
});

describe("clearing history", () => {
  beforeEach(async () => {
    await roomOf("ann", "bob");
    await matchOn(1);
    await tick();
  });

  it("empties the caller's match list and nobody else's", async () => {
    await clearHistory({ kind: "MATCHES" }, ANN);
    expect(await matchTitles(ANN)).toEqual([]);
    expect(await matchTitles(BOB)).toEqual(["Amélie"]);
  });

  it("still lists a match made afterwards", async () => {
    await clearHistory({ kind: "MATCHES" }, ANN);
    await tick();
    await matchOn(2);
    expect(await matchTitles(ANN)).toEqual(["Heat"]);
  });

  it("clears one list in one mode only", async () => {
    await clearHistory({ kind: "SWIPES", mediaType: "TV" }, ANN);
    expect(await swipeTitles()).toEqual(["Amélie"]);
    await clearHistory({ kind: "SWIPES" }, ANN);
    expect(await swipeTitles()).toEqual([]);
    expect(await matchTitles(ANN)).toEqual(["Amélie"]);
  });

  it("leaves the swipes counting: the deck stays the same and a like still matches", async () => {
    await swipe({ movieId: 2, direction: "LIKE" }, ANN);
    await tick();
    await clearHistory({ kind: "SWIPES" }, ANN);
    const dealt = (await deck({ page: 1 }, ANN)).cards.map((card) => card.movie.id);
    expect(dealt).toEqual([3]);
    const answer = await swipe({ movieId: 2, direction: "LIKE" }, BOB);
    expect(answer.match).toMatchObject({ movie: { id: 2 } });
  });

  it("leaves a cleared match findable by id", async () => {
    await clearHistory({ kind: "MATCHES" }, ANN);
    const found = await matches({ ignoreCleared: true }, ANN);
    expect(found.matches.map((match) => match.movie.title)).toEqual(["Amélie"]);
  });

  it("doesn't stop a match being announced", async () => {
    await clearHistory({ kind: "MATCHES" }, ANN);
    expect(await pendingMatch({}, ANN)).toMatchObject({ movie: { id: 1 } });
  });
});

describe("someone invited in", () => {
  it("doesn't see matches from before they joined, then sees new ones", async () => {
    const room = await roomOf("ann", "bob");
    await matchOn(1);
    await tick();
    await joinRoom({ code: room.code }, CARL);
    expect(await matchTitles(CARL)).toEqual([]);
    expect(await matchTitles(ANN)).toEqual(["Amélie"]);
    await tick();
    await matchOn(2);
    expect(await matchTitles(CARL)).toEqual(["Heat"]);
  });

  it("isn't told by liking a title that matched before they joined, and can undo it", async () => {
    const room = await roomOf("ann", "bob");
    await matchOn(1);
    await tick();
    await joinRoom({ code: room.code }, CARL);
    expect((await swipe({ movieId: 1, direction: "LIKE" }, CARL)).match).toBeNull();
    expect(await undoSwipe({ movieId: 1 }, CARL)).toMatchObject({ undone: true });
  });

  it("is told about a match they helped make after joining, and can't undo that", async () => {
    const room = await roomOf("ann", "bob");
    await tick();
    await joinRoom({ code: room.code }, CARL);
    await tick();
    await swipe({ movieId: 1, direction: "LIKE" }, ANN);
    expect((await swipe({ movieId: 1, direction: "LIKE" }, CARL)).match).toMatchObject({ movie: { id: 1 } });
    expect(await undoSwipe({ movieId: 1 }, CARL)).toMatchObject({ undone: false });
  });
});
