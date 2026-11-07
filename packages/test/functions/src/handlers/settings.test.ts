import { joinRoom } from "@movie-date/functions/handlers/joinRoom";
import { leaveRoom } from "@movie-date/functions/handlers/leaveRoom";
import { matches } from "@movie-date/functions/handlers/matches";
import { myRoom } from "@movie-date/functions/handlers/myRoom";
import { onRoomEvent } from "@movie-date/functions/handlers/onRoomEvent";
import { pendingMatch } from "@movie-date/functions/handlers/pendingMatch";
import { startNewRound } from "@movie-date/functions/handlers/startNewRound";
import { swipe } from "@movie-date/functions/handlers/swipe";
import { swipeHistory } from "@movie-date/functions/handlers/swipeHistory";
import { updateFilters } from "@movie-date/functions/handlers/updateFilters";
import { updateRoomSettings } from "@movie-date/functions/handlers/updateRoomSettings";
import { encodePageToken } from "@movie-date/functions/lib/db";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { movieNamed, roomOf, user } from "../support/roomFixture";

const publishRoomEvent = vi.hoisted(() => vi.fn());
const getMovie = vi.hoisted(() => vi.fn());

vi.mock("@movie-date/functions/src/lib/events.ts", () => ({
  publishRoomEvent,
  revokeRoomSubscriptions: async () => undefined,
}));
vi.mock("@movie-date/functions/src/lib/tmdb.ts", () => ({ getMovie }));

let table: FakeDynamo;

function eventsOfType(type: string) {
  return publishRoomEvent.mock.calls.map(([event]) => event).filter((event) => event.type === type);
}

const noFilters = { genreIds: [], cast: [], services: [] };

beforeEach(() => {
  table = new FakeDynamo();
  publishRoomEvent.mockReset();
  publishRoomEvent.mockResolvedValue(undefined);
  getMovie.mockReset();
  getMovie.mockImplementation(async (movieId: number) => movieNamed(movieId));
});

afterEach(() => {
  table.restore();
});

describe("updateFilters", () => {
  it("saves the filters and tells the room", async () => {
    const room = await roomOf("ann", "bob");
    publishRoomEvent.mockClear();
    const filters = {
      genreIds: [18],
      cast: [{ id: 1, name: "Someone" }],
      services: ["netflix"],
      releaseDateGte: "2024-01-01",
    };
    await expect(updateFilters({ filters }, user("bob"))).resolves.toMatchObject({ filters });
    expect(eventsOfType("ROOM_UPDATED")).toEqual([
      { roomId: room.id, type: "ROOM_UPDATED", actorId: "sub-bob" },
    ]);
  });

  it.each([
    ["too many genres", { genreIds: Array.from({ length: 21 }, (_, index) => index + 1) }],
    ["a negative genre", { genreIds: [-1] }],
    ["a fractional genre", { genreIds: [1.5] }],
    ["too many actors", { cast: Array.from({ length: 21 }, (_, index) => ({ id: index + 1, name: "A" })) }],
    ["a negative actor id", { cast: [{ id: -1, name: "A" }] }],
    ["an overlong actor name", { cast: [{ id: 1, name: "x".repeat(201) }] }],
    ["repeated services", { services: Array.from({ length: 100 }, () => "netflix") }],
  ])("refuses %s, leaving the room's filters alone", async (_label, patch) => {
    const room = await roomOf("ann");
    await expect(updateFilters({ filters: { ...noFilters, ...patch } }, user("ann"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(table.row(`ROOM#${room.id}`, "META")?.filters).toEqual(room.filters);
  });

  it("keeps a TMDB profile image", async () => {
    const profileUrl = "https://image.tmdb.org/t/p/w185/face.jpg";
    const room = await updateFilters(
      { filters: { ...noFilters, cast: [{ id: 1, name: "Someone", profileUrl }] } },
      user("ann"),
    );
    expect(room.filters.cast).toEqual([{ id: 1, name: "Someone", profileUrl }]);
  });

  it.each([
    ["script", "javascript:alert(1)"],
    ["another host", "https://evil.example/pixel.gif?who=roommate"],
    ["a lookalike host", "https://image.tmdb.org.evil.example/t/p/x.gif"],
  ])("drops a %s profile image, which roommates' browsers would load", async (_label, profileUrl) => {
    const room = await updateFilters(
      { filters: { ...noFilters, cast: [{ id: 1, name: "Someone", profileUrl }] } },
      user("ann"),
    );
    expect(room.filters.cast).toEqual([{ id: 1, name: "Someone", profileUrl: null }]);
  });

  it("can clear everything, nulls included", async () => {
    await updateFilters(
      { filters: { ...noFilters, genreIds: [18], releaseDateGte: "2024-01-01" } },
      user("ann"),
    );
    const room = await updateFilters(
      { filters: { ...noFilters, releaseDateGte: null, releaseDateLte: null } },
      user("ann"),
    );
    expect(room.filters).toEqual(noFilters);
  });

  it.each([
    ["an unknown service", { ...noFilters, services: ["blockbuster"] }],
    ["a malformed date", { ...noFilters, releaseDateGte: "01/02/2024" }],
    ["an impossible date", { ...noFilters, releaseDateLte: "2024-13-45" }],
  ])("refuses %s", async (_label, filters) => {
    await expect(updateFilters({ filters }, user("ann"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(publishRoomEvent).not.toHaveBeenCalled();
  });

  it("waits out a match transaction holding the room row", async () => {
    const room = await myRoom({}, user("ann"));
    const release = table.holdItem({ pk: `ROOM#${room.id}`, sk: "META" });
    setTimeout(release, 5);
    await expect(
      updateFilters({ filters: { ...noFilters, genreIds: [18] } }, user("ann")),
    ).resolves.toMatchObject({ filters: { genreIds: [18] } });
  });
});

describe("updateRoomSettings", () => {
  it("clamps to the slider's range", async () => {
    await roomOf("ann", "bob", "cat");
    await expect(
      updateRoomSettings({ matchThreshold: 9, requireMajority: false }, user("ann")),
    ).resolves.toMatchObject({ matchThreshold: 3 });
    await expect(
      updateRoomSettings({ matchThreshold: 0, requireMajority: false }, user("ann")),
    ).resolves.toMatchObject({ matchThreshold: 2 });
  });

  it("gives a lone member a threshold of two", async () => {
    await expect(
      updateRoomSettings({ matchThreshold: 1, requireMajority: false }, user("ann")),
    ).resolves.toMatchObject({ matchThreshold: 2 });
  });

  it("derives a majority from the member count", async () => {
    await roomOf("ann", "bob", "cat", "dan", "eve");
    await expect(
      updateRoomSettings({ matchThreshold: 2, requireMajority: true }, user("ann")),
    ).resolves.toMatchObject({ matchThreshold: 3, requireMajority: true });
  });

  it("tracks the majority as members leave", async () => {
    await roomOf("ann", "bob", "cat", "dan", "eve");
    await updateRoomSettings({ matchThreshold: 2, requireMajority: true }, user("ann"));
    await leaveRoom({}, user("eve"));
    await leaveRoom({}, user("dan"));
    await expect(myRoom({}, user("ann"))).resolves.toMatchObject({ matchThreshold: 2 });
  });

  it("publishes ROOM_UPDATED", async () => {
    const room = await roomOf("ann", "bob");
    publishRoomEvent.mockClear();
    await updateRoomSettings({ matchThreshold: 2, requireMajority: false }, user("ann"));
    expect(eventsOfType("ROOM_UPDATED")).toEqual([
      { roomId: room.id, type: "ROOM_UPDATED", actorId: "sub-ann" },
    ]);
  });

  it("turns tallies into matches when the threshold drops", async () => {
    const room = await roomOf("ann", "bob", "cat");
    await updateRoomSettings({ matchThreshold: 3, requireMajority: false }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    await swipe({ movieId: 8, direction: "LIKE" }, user("cat"));
    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toEqual([]);

    await updateRoomSettings({ matchThreshold: 2, requireMajority: false }, user("ann"));

    expect(table.find(`ROOM#${room.id}`, "MATCH#").map((row) => row.movieId)).toEqual([7]);
    expect(eventsOfType("MATCH_FOUND")).toHaveLength(1);
  });

  it("doesn't re-match what already matched", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    await updateRoomSettings({ matchThreshold: 2, requireMajority: false }, user("ann"));
    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toHaveLength(1);
    expect(eventsOfType("MATCH_FOUND")).toHaveLength(1);
  });

  it("shows everyone the strongest match when one change tips several", async () => {
    await roomOf("ann", "bob", "cat", "dan");
    await updateRoomSettings({ matchThreshold: 4, requireMajority: false }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    for (const name of ["ann", "bob", "cat"]) {
      await swipe({ movieId: 8, direction: "LIKE" }, user(name));
    }

    await updateRoomSettings({ matchThreshold: 2, requireMajority: false }, user("ann"));

    expect(eventsOfType("MATCH_FOUND").map((event) => event.movieId)).toEqual([8, 7]);
    await expect(pendingMatch({}, user("dan"))).resolves.toMatchObject({ movie: { id: 8 } });
  });

  it("never loses a match to a like racing the lowered threshold", async () => {
    for (let trial = 0; trial < 15; trial += 1) {
      const [first, second, third] = [`a${trial}`, `b${trial}`, `c${trial}`];
      const room = await roomOf(first, second, third);
      await updateRoomSettings({ matchThreshold: 3, requireMajority: false }, user(first));
      await swipe({ movieId: 7, direction: "LIKE" }, user(first));

      await Promise.all([
        swipe({ movieId: 7, direction: "LIKE" }, user(second)),
        updateRoomSettings({ matchThreshold: 2, requireMajority: false }, user(third)),
      ]);

      expect(table.find(`ROOM#${room.id}`, "MATCH#")).toHaveLength(1);
    }
    expect(eventsOfType("MATCH_FOUND")).toHaveLength(15);
  });
});

describe("startNewRound", () => {
  it("advances the round and keeps history", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    publishRoomEvent.mockClear();

    await expect(startNewRound({ expectedRound: 1 }, user("ann"))).resolves.toMatchObject({
      round: 2,
    });

    expect(eventsOfType("ROUND_RESET")).toEqual([
      { roomId: room.id, type: "ROUND_RESET", round: 2, actorId: "sub-ann" },
    ]);
    expect(table.find(`ROOM#${room.id}`, "SWIPE#1#")).toHaveLength(2);
    await expect(matches({}, user("ann"))).resolves.toMatchObject({
      matches: [{ movie: { id: 7 }, round: 1 }],
    });
  });

  it("advances once when two members press together", async () => {
    await roomOf("ann", "bob");
    const results = await Promise.all([
      startNewRound({ expectedRound: 1 }, user("ann")),
      startNewRound({ expectedRound: 1 }, user("bob")),
    ]);
    expect(results.map((room) => room.round)).toEqual([2, 2]);
    expect(eventsOfType("ROUND_RESET")).toHaveLength(1);
  });

  it("just reports the room to someone pressing late", async () => {
    await roomOf("ann", "bob");
    await startNewRound({ expectedRound: 1 }, user("ann"));
    publishRoomEvent.mockClear();
    await expect(startNewRound({ expectedRound: 1 }, user("bob"))).resolves.toMatchObject({
      round: 2,
    });
    expect(publishRoomEvent).not.toHaveBeenCalled();
  });

  it("only ever acts on the caller's own room", async () => {
    const room = await myRoom({}, user("ann"));
    await myRoom({}, user("bob"));
    await startNewRound({ expectedRound: 1 }, user("bob"));
    expect(table.row(`ROOM#${room.id}`, "META")?.round).toBe(1);
  });
});

describe("pendingMatch", () => {
  it("is null with no match this round", async () => {
    await roomOf("ann", "bob");
    await expect(pendingMatch({}, user("ann"))).resolves.toBeNull();
  });

  it("finds the round's match for someone who missed the event", async () => {
    const room = await roomOf("ann", "bob", "cat");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    const { match } = await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    await expect(pendingMatch({}, user("cat"))).resolves.toEqual(match);
    expect(match?.roomId).toBe(room.id);
  });

  it("clears when the round advances", async () => {
    await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    await startNewRound({ expectedRound: 1 }, user("bob"));
    await expect(pendingMatch({}, user("ann"))).resolves.toBeNull();
  });

  it("stays on the first match of a round", async () => {
    await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    await new Promise((resolve) => setTimeout(resolve, 2));
    await swipe({ movieId: 8, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 8, direction: "LIKE" }, user("bob"));
    await expect(pendingMatch({}, user("ann"))).resolves.toMatchObject({ movie: { id: 7 } });
  });
});

describe("matches", () => {
  async function makeMatches(count: number) {
    await roomOf("ann", "bob");
    for (let movieId = 1; movieId <= count; movieId += 1) {
      await swipe({ movieId, direction: "LIKE" }, user("ann"));
      await swipe({ movieId, direction: "LIKE" }, user("bob"));
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  }

  it("pages newest first, and ignores the sentinels beside them", async () => {
    await makeMatches(3);
    const first = await matches({ limit: 2 }, user("ann"));
    expect(first.matches.map((match) => match.movie.id)).toEqual([3, 2]);
    const second = await matches({ limit: 2, nextToken: first.nextToken }, user("ann"));
    expect(second.matches.map((match) => match.movie.id)).toEqual([1]);
    expect(second.nextToken).toBeNull();
  });

  it("spans rounds", async () => {
    await makeMatches(1);
    await startNewRound({ expectedRound: 1 }, user("ann"));
    await swipe({ movieId: 1, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 1, direction: "LIKE" }, user("bob"));
    const page = await matches({}, user("bob"));
    expect(page.matches.map((match) => match.round).sort()).toEqual([1, 2]);
  });

  it("refuses a token minted for another room", async () => {
    await makeMatches(1);
    const nextToken = encodePageToken({ pk: "ROOM#someone-else", sk: "MATCH#x" });
    await expect(matches({ nextToken }, user("ann"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("shows nothing from a room the caller isn't in", async () => {
    await makeMatches(1);
    await expect(matches({}, user("cat"))).resolves.toEqual({ matches: [], nextToken: null });
  });
});

describe("swipeHistory", () => {
  async function swipeInOrder(name: string, movieIds: number[]) {
    for (const movieId of movieIds) {
      await swipe({ movieId, direction: movieId % 2 ? "LIKE" : "PASS" }, user(name));
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  }

  it("lists only the caller's swipes, newest first, across rounds", async () => {
    await roomOf("ann", "bob");
    await swipeInOrder("ann", [2, 4]);
    await swipeInOrder("bob", [6]);
    await startNewRound({ expectedRound: 1 }, user("ann"));
    await swipeInOrder("ann", [2]);

    const { entries, nextToken } = await swipeHistory({}, user("ann"));
    expect(entries.map((entry) => [entry.movie.id, entry.round])).toEqual([
      [2, 2],
      [4, 1],
      [2, 1],
    ]);
    expect(entries[0]?.direction).toBe("PASS");
    expect(nextToken).toBeNull();
  });

  it("pages without repeats even as new swipes arrive", async () => {
    await roomOf("ann");
    await swipeInOrder("ann", [1, 2, 3, 4]);

    const first = await swipeHistory({ limit: 2 }, user("ann"));
    expect(first.entries.map((entry) => entry.movie.id)).toEqual([4, 3]);

    await swipeInOrder("ann", [5]);

    const second = await swipeHistory({ limit: 2, nextToken: first.nextToken }, user("ann"));
    expect(second.entries.map((entry) => entry.movie.id)).toEqual([2, 1]);
    expect(second.nextToken).toBeNull();
  });

  it("refuses a token for another room or without a position", async () => {
    await roomOf("ann");
    await expect(
      swipeHistory({ nextToken: encodePageToken({ pk: "ROOM#other", sk: "x", swipedAt: "y" }) }, user("ann")),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const room = await myRoom({}, user("ann"));
    await expect(
      swipeHistory({ nextToken: encodePageToken({ pk: `ROOM#${room.id}` }) }, user("ann")),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("caps the page size", async () => {
    await roomOf("ann");
    await swipeInOrder("ann", [1, 2, 3]);
    const { entries } = await swipeHistory({ limit: 0 }, user("ann"));
    expect(entries).toHaveLength(3);
  });
});

describe("onRoomEvent", () => {
  it("admits a member", async () => {
    const room = await roomOf("ann", "bob");
    await expect(onRoomEvent({ roomId: room.id }, user("bob"))).resolves.toBeNull();
  });

  it("rejects someone from another room", async () => {
    const room = await myRoom({}, user("ann"));
    await myRoom({}, user("bob"));
    await expect(onRoomEvent({ roomId: room.id }, user("bob"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects someone with no profile", async () => {
    const room = await myRoom({}, user("ann"));
    await expect(onRoomEvent({ roomId: room.id }, user("ghost"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("rejects a member who has left, and admits them to where they went", async () => {
    const room = await roomOf("ann", "bob");
    const fresh = await leaveRoom({}, user("bob"));
    await expect(onRoomEvent({ roomId: room.id }, user("bob"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(onRoomEvent({ roomId: fresh.id }, user("bob"))).resolves.toBeNull();
  });

  it("admits someone straight after joining", async () => {
    const room = await myRoom({}, user("ann"));
    await myRoom({}, user("bob"));
    await joinRoom({ code: room.code }, user("bob"));
    await expect(onRoomEvent({ roomId: room.id }, user("bob"))).resolves.toBeNull();
  });
});
