import { swipe } from "@movie-date/functions/handlers/swipe";
import { leaveRoom } from "@movie-date/functions/handlers/leaveRoom";
import { startNewRound } from "@movie-date/functions/handlers/startNewRound";
import { undoSwipe } from "@movie-date/functions/handlers/undoSwipe";
import { updateRoomSettings } from "@movie-date/functions/handlers/updateRoomSettings";
import { ConflictError, UpstreamError } from "@movie-date/functions/lib/errors";
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

function matchEvents() {
  return publishRoomEvent.mock.calls.filter(([event]) => event.type === "MATCH_FOUND");
}

function tallyLikes(roomId: string, round: number, movieId: number) {
  return table.row(`ROOM#${roomId}`, `TALLY#${round}#movie:${movieId}`)?.likes;
}

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

describe("swipe", () => {
  it("records a pass without touching the tally", async () => {
    const room = await roomOf("ann");
    const result = await swipe({ movieId: 7, direction: "PASS" }, user("ann"));
    expect(result).toEqual({ movieId: 7, direction: "PASS", match: null });
    expect(table.find(`ROOM#${room.id}`, "TALLY#")).toEqual([]);
    expect(table.row(`ROOM#${room.id}`, "SWIPE#1#sub-ann#movie:7")).toMatchObject({
      direction: "PASS",
      movie: { title: "Movie 7" },
    });
  });

  it("matches when the likes reach the threshold, and tells the room once", async () => {
    const room = await roomOf("ann", "bob");
    const first = await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    expect(first.match).toBeNull();

    const second = await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    expect(second.match).toMatchObject({
      roomId: room.id,
      round: 1,
      movie: { id: 7, title: "Movie 7" },
    });
    expect(matchEvents()).toHaveLength(1);
    expect(matchEvents()[0]?.[0]).toEqual({
      roomId: room.id,
      type: "MATCH_FOUND",
      movieId: 7,
      matchId: second.match?.id,
      round: 1,
      actorId: "sub-bob",
    });
    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toHaveLength(1);
    expect(table.row(`ROOM#${room.id}`, "MATCHED#1#movie:7")?.matchId).toBe(second.match?.id);
  });

  it("uses the room's threshold, not a fixed two", async () => {
    await roomOf("ann", "bob", "cat");
    await updateRoomSettings({ matchThreshold: 3, requireMajority: false }, user("ann"));

    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    const second = await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    expect(second.match).toBeNull();
    const third = await swipe({ movieId: 7, direction: "LIKE" }, user("cat"));
    expect(third.match).not.toBeNull();
  });

  it("doesn't count passes toward a match", async () => {
    await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    const result = await swipe({ movieId: 7, direction: "PASS" }, user("bob"));
    expect(result.match).toBeNull();
    expect(matchEvents()).toHaveLength(0);
  });

  it("treats a repeat as a no-op that keeps the first direction", async () => {
    const room = await roomOf("ann");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    const repeat = await swipe({ movieId: 7, direction: "PASS" }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));

    expect(repeat.direction).toBe("LIKE");
    expect(tallyLikes(room.id, 1, 7)).toBe(1);
    expect(getMovie).toHaveBeenCalledOnce();
  });

  it("counts a double tap once", async () => {
    const room = await roomOf("ann", "bob");
    await Promise.all([
      swipe({ movieId: 7, direction: "LIKE" }, user("ann")),
      swipe({ movieId: 7, direction: "LIKE" }, user("ann")),
      swipe({ movieId: 7, direction: "LIKE" }, user("ann")),
    ]);
    expect(tallyLikes(room.id, 1, 7)).toBe(1);
    expect(matchEvents()).toHaveLength(0);
  });

  it("makes one match from many simultaneous likes, losing none of them", async () => {
    const names = ["ann", "bob", "cat", "dan", "eve", "fay"];
    const room = await roomOf(...names);
    const results = await Promise.all(
      names.map((name) => swipe({ movieId: 7, direction: "LIKE" }, user(name))),
    );

    expect(tallyLikes(room.id, 1, 7)).toBe(names.length);
    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toHaveLength(1);
    expect(table.find(`ROOM#${room.id}`, "MATCHED#")).toHaveLength(1);
    expect(matchEvents()).toHaveLength(1);
    const matchIds = new Set(results.flatMap((result) => result.match?.id ?? []));
    expect(matchIds).toEqual(new Set([table.row(`ROOM#${room.id}`, "MATCHED#1#movie:7")?.matchId]));
  });

  it("never misses a match when the deciding likes land together", async () => {
    for (let trial = 0; trial < 15; trial += 1) {
      const owner = `owner${trial}`;
      const guest = `guest${trial}`;
      const room = await roomOf(owner, guest);
      await Promise.all([
        swipe({ movieId: 7, direction: "LIKE" }, user(owner)),
        swipe({ movieId: 7, direction: "LIKE" }, user(guest)),
      ]);
      expect(table.find(`ROOM#${room.id}`, "MATCH#")).toHaveLength(1);
    }
  });

  it("keeps matches on different movies independent", async () => {
    const room = await roomOf("ann", "bob");
    await Promise.all(
      [7, 8, 9].flatMap((movieId) => [
        swipe({ movieId, direction: "LIKE" }, user("ann")),
        swipe({ movieId, direction: "LIKE" }, user("bob")),
      ]),
    );
    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toHaveLength(3);
    expect(matchEvents()).toHaveLength(3);
  });

  it("gives up cleanly when conflicts never clear", async () => {
    const room = await roomOf("ann");
    table.conflictsToForce = 100;
    await expect(swipe({ movieId: 7, direction: "LIKE" }, user("ann"))).rejects.toBeInstanceOf(
      ConflictError,
    );
    expect(table.find(`ROOM#${room.id}`, "SWIPE#")).toEqual([]);
    expect(table.find(`ROOM#${room.id}`, "TALLY#")).toEqual([]);
    table.conflictsToForce = 0;
  });

  it("recovers from a few conflicts", async () => {
    const room = await roomOf("ann");
    table.conflictsToForce = 3;
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    expect(tallyLikes(room.id, 1, 7)).toBe(1);
  });

  it("completes the match on a repeat if the first attempt died before its check", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));

    table.beforeTransaction((items) => {
      if (!items[0]?.Put?.Item?.sk?.toString().startsWith("MATCHED#")) return false;
      throw new Error("Lambda died");
    });
    await expect(swipe({ movieId: 7, direction: "LIKE" }, user("bob"))).rejects.toThrow();
    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toEqual([]);

    const repeat = await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    expect(repeat.match).not.toBeNull();
    expect(tallyLikes(room.id, 1, 7)).toBe(2);
  });

  it("returns the existing match to a repeat without announcing it again", async () => {
    await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    const original = await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    const repeat = await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    expect(repeat.match?.id).toBe(original.match?.id);
    expect(matchEvents()).toHaveLength(1);
  });

  it("tells a late liker about a match they were too late to make", async () => {
    const room = await roomOf("ann", "bob", "cat");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    const original = await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    const late = await swipe({ movieId: 7, direction: "LIKE" }, user("cat"));

    expect(late.match?.id).toBe(original.match?.id);
    expect(tallyLikes(room.id, 1, 7)).toBe(3);
    expect(matchEvents()).toHaveLength(1);
  });

  it("starts each round's tally from nothing", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await startNewRound({ expectedRound: 1 }, user("ann"));

    const again = await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    expect(again.match).toBeNull();
    expect(tallyLikes(room.id, 2, 7)).toBe(1);

    const repeatRound = await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    expect(repeatRound.match?.round).toBe(2);
  });

  it("makes no match if an undo drops the tally just before the claim", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));

    table.beforeTransaction(async (items) => {
      if (!items[0]?.Put?.Item?.sk?.toString().startsWith("MATCHED#")) return false;
      await undoSwipe({ movieId: 7 }, user("ann"));
      return true;
    });
    const result = await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));

    expect(result.match).toBeNull();
    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toEqual([]);
    expect(table.find(`ROOM#${room.id}`, "MATCHED#")).toEqual([]);
    expect(matchEvents()).toHaveLength(0);
  });

  it("makes no match if the round ends just before the claim", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));

    table.beforeTransaction(async (items) => {
      if (!items[0]?.Put?.Item?.sk?.toString().startsWith("MATCHED#")) return false;
      await startNewRound({ expectedRound: 1 }, user("ann"));
      return true;
    });
    const result = await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));

    expect(result.match).toBeNull();
    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toEqual([]);
  });

  it("moves a swipe caught mid-leave into the caller's new room", async () => {
    const room = await roomOf("ann", "bob");
    table.beforeTransaction(async (items) => {
      if (!items[0]?.Put?.Item?.sk?.toString().startsWith("SWIPE#")) return false;
      await leaveRoom({}, user("bob"));
      return true;
    });

    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));

    expect(table.find(`ROOM#${room.id}`, "SWIPE#")).toEqual([]);
    expect(tallyLikes(room.id, 1, 7)).toBeUndefined();
    const profile = table.row("USER#sub-bob", "PROFILE");
    expect(table.find(`ROOM#${String(profile?.roomId)}`, "SWIPE#")).toHaveLength(1);
  });

  it("writes nothing when the movie can't be loaded", async () => {
    const room = await roomOf("ann");
    getMovie.mockRejectedValue(new UpstreamError());
    await expect(swipe({ movieId: 7, direction: "LIKE" }, user("ann"))).rejects.toBeInstanceOf(
      UpstreamError,
    );
    expect(table.find(`ROOM#${room.id}`, "SWIPE#")).toEqual([]);
  });

  it("refuses an impossible movie id", async () => {
    await expect(swipe({ movieId: -1, direction: "LIKE" }, user("ann"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("undoSwipe", () => {
  it("takes back a like", async () => {
    const room = await roomOf("ann");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await expect(undoSwipe({ movieId: 7 }, user("ann"))).resolves.toEqual({
      movieId: 7,
      undone: true,
    });
    expect(tallyLikes(room.id, 1, 7)).toBe(0);
    expect(table.find(`ROOM#${room.id}`, "SWIPE#")).toEqual([]);
  });

  it("takes back a pass without touching a tally", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    await swipe({ movieId: 7, direction: "PASS" }, user("ann"));
    await expect(undoSwipe({ movieId: 7 }, user("ann"))).resolves.toMatchObject({ undone: true });
    expect(tallyLikes(room.id, 1, 7)).toBe(1);
  });

  it("reports when there is nothing to undo", async () => {
    await roomOf("ann");
    await expect(undoSwipe({ movieId: 7 }, user("ann"))).resolves.toEqual({
      movieId: 7,
      undone: false,
    });
  });

  it("only reaches the caller's own swipe", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    await expect(undoSwipe({ movieId: 7 }, user("ann"))).resolves.toMatchObject({ undone: false });
    expect(tallyLikes(room.id, 1, 7)).toBe(1);
  });

  it("refuses once the movie has matched", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));

    await expect(undoSwipe({ movieId: 7 }, user("ann"))).resolves.toMatchObject({ undone: false });
    expect(tallyLikes(room.id, 1, 7)).toBe(2);
    expect(table.find(`ROOM#${room.id}`, "SWIPE#")).toHaveLength(2);
  });

  it("decrements once when pressed twice at the same moment", async () => {
    const room = await roomOf("ann");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));

    const results = await Promise.all([
      undoSwipe({ movieId: 7 }, user("ann")),
      undoSwipe({ movieId: 7 }, user("ann")),
    ]);
    expect(results.filter((result) => result.undone)).toHaveLength(1);
    expect(tallyLikes(room.id, 1, 7)).toBe(0);
  });

  it("loses cleanly to a match claimed just before it", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));

    table.beforeTransaction(async (items) => {
      if (!items[0]?.Delete) return false;
      await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
      return true;
    });

    await expect(undoSwipe({ movieId: 7 }, user("ann"))).resolves.toMatchObject({ undone: false });
    expect(tallyLikes(room.id, 1, 7)).toBe(2);
    expect(table.row(`ROOM#${room.id}`, "SWIPE#1#sub-ann#movie:7")).toBeDefined();
  });

  it("never leaves an undone like behind a match when the two race", async () => {
    for (let trial = 0; trial < 15; trial += 1) {
      const owner = `undoer${trial}`;
      const guest = `liker${trial}`;
      const room = await roomOf(owner, guest);
      await swipe({ movieId: 7, direction: "LIKE" }, user(owner));

      const [undo] = await Promise.all([
        undoSwipe({ movieId: 7 }, user(owner)),
        swipe({ movieId: 7, direction: "LIKE" }, user(guest)),
      ]);

      const matchCount = table.find(`ROOM#${room.id}`, "MATCH#").length;
      expect(matchCount).toBe(undo.undone ? 0 : 1);
      expect(tallyLikes(room.id, 1, 7)).toBe(undo.undone ? 1 : 2);
    }
  });

  it("can be followed by a fresh swipe", async () => {
    const room = await roomOf("ann");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await undoSwipe({ movieId: 7 }, user("ann"));
    const again = await swipe({ movieId: 7, direction: "PASS" }, user("ann"));
    expect(again.direction).toBe("PASS");
    expect(tallyLikes(room.id, 1, 7)).toBe(0);
  });
});
