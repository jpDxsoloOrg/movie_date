import { clearMatch } from "@movie-date/functions/handlers/clearMatch";
import { deck } from "@movie-date/functions/handlers/deck";
import { joinRoom } from "@movie-date/functions/handlers/joinRoom";
import { matches } from "@movie-date/functions/handlers/matches";
import { pendingMatch } from "@movie-date/functions/handlers/pendingMatch";
import { startNewRound } from "@movie-date/functions/handlers/startNewRound";
import { swipe } from "@movie-date/functions/handlers/swipe";
import { undoSwipe } from "@movie-date/functions/handlers/undoSwipe";
import { discoverMovies, hydrateMovies } from "@movie-date/functions/lib/tmdb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { movieNamed, roomOf, user } from "../support/roomFixture";

const { publishRoomEvent } = vi.hoisted(() => ({ publishRoomEvent: vi.fn() }));

vi.mock("@movie-date/functions/lib/events", () => ({
  publishRoomEvent,
  revokeRoomSubscriptions: async () => undefined,
}));
vi.mock("@movie-date/functions/lib/tmdb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/tmdb")>()),
  getMovie: async (id: number) => movieNamed(id),
  discoverMovies: vi.fn(),
  hydrateMovies: vi.fn(),
}));

const ANN = user("ann");
const BOB = user("bob");
const CARL = user("carl");

let table: FakeDynamo;

beforeEach(() => {
  table = new FakeDynamo();
  publishRoomEvent.mockReset();
  publishRoomEvent.mockResolvedValue(undefined);
});

afterEach(() => {
  table.restore();
});

/** Ann and Bob agree on a title, and the id of the match comes back. */
async function matchOn(movieId: number): Promise<string> {
  await swipe({ movieId, direction: "LIKE" }, ANN);
  const { match } = await swipe({ movieId, direction: "LIKE" }, BOB);
  if (!match) throw new Error("expected a match");
  return match.id;
}

function clearedEvents(): unknown[] {
  return publishRoomEvent.mock.calls.filter(([event]) => event.type === "MATCH_CLEARED");
}

describe("clearMatch", () => {
  it("marks the sentinel and the match row, and tells the room", async () => {
    const room = await roomOf("ann", "bob");
    const matchId = await matchOn(1);

    expect(await clearMatch({ matchId }, ANN)).toBe(true);

    const pk = `ROOM#${room.id}`;
    expect(table.find(pk, "MATCHED#")[0]?.clearedAt).toEqual(expect.any(String));
    expect(table.find(pk, "MATCH#")[0]?.clearedAt).toEqual(expect.any(String));
    expect(clearedEvents()).toEqual([
      [{ roomId: room.id, type: "MATCH_CLEARED", mediaType: "MOVIE", matchId, actorId: "sub-ann" }],
    ]);
  });

  it("keeps the match in history, marked cleared", async () => {
    await roomOf("ann", "bob");
    const matchId = await matchOn(1);
    await clearMatch({ matchId }, ANN);
    expect((await matches({}, BOB)).matches).toMatchObject([{ id: matchId, cleared: true }]);
  });

  it("leaves the round and the swipes alone", async () => {
    const room = await roomOf("ann", "bob");
    const matchId = await matchOn(1);
    await clearMatch({ matchId }, ANN);
    const pk = `ROOM#${room.id}`;
    expect(table.find(pk, "META")[0]?.round).toBe(1);
    expect(table.find(pk, "SWIPE#1#")).toHaveLength(2);
  });

  it("does nothing the second time, with no second event", async () => {
    await roomOf("ann", "bob");
    const matchId = await matchOn(1);
    await clearMatch({ matchId }, ANN);
    expect(await clearMatch({ matchId }, BOB)).toBe(true);
    expect(clearedEvents()).toHaveLength(1);
  });

  it("is false for an id it doesn't know", async () => {
    await roomOf("ann", "bob");
    await matchOn(1);
    expect(await clearMatch({ matchId: "nope" }, ANN)).toBe(false);
    expect(clearedEvents()).toEqual([]);
  });

  it("is false for the other mode's match", async () => {
    await roomOf("ann", "bob");
    const matchId = await matchOn(1);
    expect(await clearMatch({ matchId, mediaType: "TV" }, ANN)).toBe(false);
    expect(await pendingMatch({}, ANN)).toMatchObject({ id: matchId });
  });

  it("is false for an older round's match", async () => {
    await roomOf("ann", "bob");
    const matchId = await matchOn(1);
    await startNewRound({ expectedRound: 1 }, ANN);
    expect(await clearMatch({ matchId }, ANN)).toBe(false);
  });

  it("can't reach into someone else's room", async () => {
    await roomOf("ann", "bob");
    const matchId = await matchOn(1);
    await roomOf("carl");
    expect(await clearMatch({ matchId }, CARL)).toBe(false);
    expect(await pendingMatch({}, ANN)).toMatchObject({ id: matchId });
  });

  it("retries a cancelled transaction until the clear has landed", async () => {
    await roomOf("ann", "bob");
    const matchId = await matchOn(1);
    publishRoomEvent.mockClear();
    table.conflictsToForce = 1;
    expect(await clearMatch({ matchId }, ANN)).toBe(true);
    expect(clearedEvents()).toHaveLength(1);
    expect(await pendingMatch({}, ANN)).toBeNull();
  });
});

describe("undoing around a match", () => {
  it("lets someone undo a pass on a matched title, without a word about the match", async () => {
    await roomOf("ann", "bob", "carl");
    await matchOn(1);
    await swipe({ movieId: 1, direction: "PASS" }, CARL);
    expect(await undoSwipe({ movieId: 1 }, CARL)).toMatchObject({ undone: true });
  });

  it("lets someone undo a like on a cleared title, and it stays cleared", async () => {
    await roomOf("ann", "bob");
    const matchId = await matchOn(1);
    await clearMatch({ matchId }, ANN);
    expect(await undoSwipe({ movieId: 1 }, BOB)).toMatchObject({ undone: true });
    expect(await pendingMatch({}, ANN)).toBeNull();
  });

  it("still refuses to undo a like an uncleared match was built on", async () => {
    await roomOf("ann", "bob");
    await matchOn(1);
    expect(await undoSwipe({ movieId: 1 }, BOB)).toMatchObject({ undone: false });
  });
});

describe("pendingMatch", () => {
  it("skips a cleared match and moves on to the next", async () => {
    await roomOf("ann", "bob");
    const first = await matchOn(1);
    const second = await matchOn(2);
    expect(await pendingMatch({}, ANN)).toMatchObject({ id: first });

    await clearMatch({ matchId: first }, ANN);
    expect(await pendingMatch({}, ANN)).toMatchObject({ id: second });

    await clearMatch({ matchId: second }, BOB);
    expect(await pendingMatch({}, ANN)).toBeNull();
  });

  it("doesn't tell someone invited in about a match made before they arrived", async () => {
    const room = await roomOf("ann", "bob");
    await matchOn(1);
    await joinRoom({ code: room.code }, CARL);
    table.seed({ pk: `ROOM#${room.id}`, sk: "MEMBER#sub-carl", joinedAt: "2099-01-01T00:00:00.000Z" });

    expect(await pendingMatch({}, CARL)).toBeNull();
    expect(await pendingMatch({}, ANN)).not.toBeNull();
  });

  it("still tells a member about a match made after they joined", async () => {
    const room = await roomOf("ann", "bob", "carl");
    const matchId = await matchOn(1);
    expect(room.members).toHaveLength(3);
    expect(await pendingMatch({}, CARL)).toMatchObject({ id: matchId });
  });
});

describe("after a clear", () => {
  it("someone new liking the title isn't told it matched", async () => {
    const room = await roomOf("ann", "bob");
    const matchId = await matchOn(1);
    await clearMatch({ matchId }, ANN);
    await joinRoom({ code: room.code }, CARL);

    const result = await swipe({ movieId: 1, direction: "LIKE" }, CARL);

    expect(result.match).toBeNull();
    expect(publishRoomEvent.mock.calls.filter(([event]) => event.type === "MATCH_FOUND")).toHaveLength(1);
  });

  it("someone new isn't dealt the title", async () => {
    const room = await roomOf("ann", "bob");
    const matchId = await matchOn(1);
    await clearMatch({ matchId }, ANN);
    await joinRoom({ code: room.code }, CARL);
    vi.mocked(discoverMovies).mockResolvedValue({
      totalPages: 1,
      totalResults: 2,
      results: [1, 2].map((id) => ({ id, originalLanguage: "en", hasPoster: true })),
    });
    vi.mocked(hydrateMovies).mockImplementation(async (ids) =>
      ids.map((id) => ({ ...movieNamed(id), posterUrl: `https://img/${id}.jpg` })),
    );

    const page = await deck({ page: 1 }, CARL);

    expect(page.cards.map((card) => card.movie.id)).toEqual([2]);
  });
});
