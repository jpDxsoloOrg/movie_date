import { joinRoom } from "@movie-date/functions/handlers/joinRoom";
import { leaveRoom } from "@movie-date/functions/handlers/leaveRoom";
import { myRoom } from "@movie-date/functions/handlers/myRoom";
import { swipe } from "@movie-date/functions/handlers/swipe";
import { undoSwipe } from "@movie-date/functions/handlers/undoSwipe";
import { updateRoomSettings } from "@movie-date/functions/handlers/updateRoomSettings";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { movieNamed, roomOf, user } from "../support/roomFixture";

const publishRoomEvent = vi.hoisted(() => vi.fn());
const getMovie = vi.hoisted(() => vi.fn());

const revokeRoomSubscriptions = vi.hoisted(() => vi.fn());

vi.mock("@movie-date/functions/src/lib/events.ts", () => ({ publishRoomEvent, revokeRoomSubscriptions }));
vi.mock("@movie-date/functions/src/lib/tmdb.ts", () => ({ getMovie }));

let table: FakeDynamo;

function eventsOfType(type: string) {
  return publishRoomEvent.mock.calls.map(([event]) => event).filter((event) => event.type === type);
}

function roomIdOf(name: string): string {
  return String(table.row(`USER#sub-${name}`, "PROFILE")?.roomId);
}

function membershipsOf(name: string) {
  return table.findByPkPrefix("ROOM#").filter((row) => row.sk === `MEMBER#sub-${name}`);
}

function metaRows() {
  return table.findByPkPrefix("ROOM#").filter((row) => row.sk === "META");
}

beforeEach(() => {
  table = new FakeDynamo();
  publishRoomEvent.mockReset();
  publishRoomEvent.mockResolvedValue(undefined);
  revokeRoomSubscriptions.mockReset();
  revokeRoomSubscriptions.mockResolvedValue(undefined);
  getMovie.mockReset();
  getMovie.mockImplementation(async (movieId: number) => movieNamed(movieId));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  table.restore();
  vi.restoreAllMocks();
});

describe("subscription revocation", () => {
  it("closes the leaver's subscriptions to the room they left", async () => {
    const room = await roomOf("ann", "bob");
    revokeRoomSubscriptions.mockClear();
    await leaveRoom({}, user("bob"));
    expect(revokeRoomSubscriptions.mock.calls).toEqual([[room.id, "sub-bob"]]);
  });

  it("closes them on a move to another room too, before anyone is told", async () => {
    const from = await roomOf("ann");
    const to = await roomOf("bob");
    revokeRoomSubscriptions.mockClear();
    publishRoomEvent.mockClear();
    await joinRoom({ code: to.code }, user("ann"));
    expect(revokeRoomSubscriptions.mock.calls).toEqual([[from.id, "sub-ann"]]);
    expect(revokeRoomSubscriptions.mock.invocationCallOrder[0]).toBeLessThan(
      publishRoomEvent.mock.invocationCallOrder[0] ?? 0,
    );
  });
});

describe("joinRoom wrong code limit", () => {
  const WRONG_CODE = "ZZZZZZ";
  const LIMIT = 10;

  async function guess(times: number): Promise<void> {
    for (let attempt = 0; attempt < times; attempt += 1) {
      await expect(joinRoom({ code: WRONG_CODE }, user("ann"))).rejects.toMatchObject({ code: "VALIDATION" });
    }
  }

  it("refuses more guesses once the limit is reached", async () => {
    await roomOf("ann");
    await guess(LIMIT);
    await expect(joinRoom({ code: WRONG_CODE }, user("ann"))).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("refuses a right code too, so a refusal can't be read as a wrong guess", async () => {
    await roomOf("ann");
    const target = await roomOf("bob");
    await guess(LIMIT);
    await expect(joinRoom({ code: target.code }, user("ann"))).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("counts per person, and the row expires", async () => {
    await roomOf("ann");
    const target = await roomOf("cat");
    await guess(LIMIT);
    await roomOf("bob");
    await expect(joinRoom({ code: target.code }, user("bob"))).resolves.toBeDefined();
    const [row] = table.findByPkPrefix("USER#sub-ann").filter((item) => String(item.sk).startsWith("LIMIT#join#"));
    expect(row?.expiresAt).toEqual(expect.any(Number));
  });

  it("doesn't count a malformed code, which never reaches the table", async () => {
    await roomOf("ann");
    await expect(joinRoom({ code: "no" }, user("ann"))).rejects.toMatchObject({ code: "VALIDATION" });
    expect(table.findByPkPrefix("USER#sub-ann").filter((item) => String(item.sk).startsWith("LIMIT#"))).toEqual([]);
  });
});

describe("joinRoom", () => {
  it("moves the caller and tells both rooms", async () => {
    const target = await myRoom({}, user("ann"));
    const previous = await myRoom({}, user("bob"));
    publishRoomEvent.mockClear();

    const room = await joinRoom({ code: target.code }, user("bob"));

    expect(room.id).toBe(target.id);
    expect(room.members.map((member) => member.userId)).toEqual(["sub-ann", "sub-bob"]);
    expect(membershipsOf("bob")).toHaveLength(1);
    expect(eventsOfType("MEMBERS_CHANGED").map((event) => event.roomId).sort()).toEqual(
      [target.id, previous.id].sort(),
    );
  });

  it("forgives case, spaces and dashes", async () => {
    const target = await myRoom({}, user("ann"));
    const typed = `${target.code.slice(0, 3).toLowerCase()}- ${target.code.slice(3).toLowerCase()}`;
    await expect(joinRoom({ code: typed }, user("bob"))).resolves.toMatchObject({ id: target.id });
  });

  it.each(["", "ABC", "ABCDEFG", "AAAAA1", "ZZZZZZ"])("rejects the code %j", async (code) => {
    await myRoom({}, user("bob"));
    await expect(joinRoom({ code }, user("bob"))).rejects.toThrow("Invalid room code");
  });

  it("does nothing when rejoining the same room", async () => {
    const room = await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    publishRoomEvent.mockClear();
    const joinedAt = table.row(`ROOM#${room.id}`, "MEMBER#sub-bob")?.joinedAt;

    await joinRoom({ code: room.code }, user("bob"));

    expect(publishRoomEvent).not.toHaveBeenCalled();
    expect(table.row(`ROOM#${room.id}`, "TALLY#1#7")?.likes).toBe(1);
    expect(table.row(`ROOM#${room.id}`, "MEMBER#sub-bob")?.joinedAt).toBe(joinedAt);
  });

  it("removes the caller's likes from the room they left, and only theirs", async () => {
    const first = await roomOf("ann", "bob");
    const other = await myRoom({}, user("cat"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 8, direction: "LIKE" }, user("bob"));
    await swipe({ movieId: 9, direction: "PASS" }, user("bob"));
    await swipe({ movieId: 10, direction: "LIKE" }, user("ann"));

    await joinRoom({ code: other.code }, user("bob"));

    const pk = `ROOM#${first.id}`;
    expect(table.row(pk, "TALLY#1#8")?.likes).toBe(0);
    expect(table.row(pk, "TALLY#1#7")?.likes).toBe(1);
    expect(table.find(pk, "SWIPE#1#sub-bob#")).toEqual([]);
    expect(table.find(pk, "SWIPE#1#sub-ann#")).toHaveLength(2);
  });

  it("settles on one room when two joins race", async () => {
    const first = await myRoom({}, user("ann"));
    const second = await myRoom({}, user("bob"));
    await myRoom({}, user("cat"));

    await Promise.all([
      joinRoom({ code: first.code }, user("cat")),
      joinRoom({ code: second.code }, user("cat")),
    ]);

    expect(membershipsOf("cat")).toHaveLength(1);
    expect(membershipsOf("cat")[0]?.pk).toBe(`ROOM#${roomIdOf("cat")}`);
  });

  it("joins once when the same join is sent twice", async () => {
    const target = await myRoom({}, user("ann"));
    await myRoom({}, user("bob"));
    await Promise.all([
      joinRoom({ code: target.code }, user("bob")),
      joinRoom({ code: target.code }, user("bob")),
    ]);
    expect(membershipsOf("bob")).toHaveLength(1);
    expect(eventsOfType("MEMBERS_CHANGED")).toHaveLength(2);
  });

  it("raises a majority threshold as the room grows", async () => {
    const room = await roomOf("ann", "bob", "cat", "dan");
    await updateRoomSettings({ matchThreshold: 2, requireMajority: true }, user("ann"));
    await joinRoom({ code: room.code }, user("eve"));
    await expect(myRoom({}, user("ann"))).resolves.toMatchObject({ matchThreshold: 3 });
  });
});

describe("leaveRoom", () => {
  it("puts the caller in a fresh room of their own", async () => {
    const room = await roomOf("ann", "bob");
    const fresh = await leaveRoom({}, user("bob"));

    expect(fresh.id).not.toBe(room.id);
    expect(fresh.code).not.toBe(room.code);
    expect(fresh.round).toBe(1);
    expect(fresh.members.map((member) => member.userId)).toEqual(["sub-bob"]);
    await expect(myRoom({}, user("ann"))).resolves.toMatchObject({
      members: [{ userId: "sub-ann" }],
    });
    expect(table.row(`USER#sub-bob`, "PROFILE")?.email).toBe("bob@example.com");
  });

  it("publishes MEMBERS_CHANGED on both rooms", async () => {
    const room = await roomOf("ann", "bob");
    publishRoomEvent.mockClear();
    const fresh = await leaveRoom({}, user("bob"));
    expect(eventsOfType("MEMBERS_CHANGED").map((event) => event.roomId).sort()).toEqual(
      [room.id, fresh.id].sort(),
    );
  });

  it("removes current-round swipes and tally contributions, keeping old rounds", async () => {
    const room = await roomOf("ann", "bob");
    const pk = `ROOM#${room.id}`;
    table.seed({ pk, sk: "SWIPE#0#sub-bob#5", direction: "LIKE", movieId: 5, swipedAt: "t" });
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    await swipe({ movieId: 8, direction: "PASS" }, user("bob"));

    await leaveRoom({}, user("bob"));

    expect(table.row(pk, "TALLY#1#7")?.likes).toBe(0);
    expect(table.find(pk, "SWIPE#1#")).toEqual([]);
    expect(table.row(pk, "SWIPE#0#sub-bob#5")).toBeDefined();
  });

  it("clears more swipes than one transaction can hold", async () => {
    const room = await roomOf("ann", "bob");
    const movieIds = Array.from({ length: 95 }, (_unused, index) => index + 1);
    for (const movieId of movieIds) {
      await swipe({ movieId, direction: "LIKE" }, user("bob"));
    }

    await leaveRoom({}, user("bob"));

    const pk = `ROOM#${room.id}`;
    expect(table.find(pk, "SWIPE#")).toEqual([]);
    expect(table.find(pk, "TALLY#").every((row) => row.likes === 0)).toBe(true);
  });

  it("makes one fresh room when pressed twice", async () => {
    const room = await roomOf("ann", "bob");
    const before = metaRows().length;
    const [first, second] = await Promise.all([
      leaveRoom({}, user("bob")),
      leaveRoom({}, user("bob")),
    ]);

    expect(first.id).toBe(second.id);
    expect(metaRows()).toHaveLength(before + 1);
    expect(membershipsOf("bob")).toHaveLength(1);
    expect(table.row(`ROOM#${room.id}`, "MEMBER#sub-bob")).toBeUndefined();
  });

  it("doesn't double-decrement against a racing undo", async () => {
    for (let trial = 0; trial < 10; trial += 1) {
      const owner = `stays${trial}`;
      const leaver = `leaves${trial}`;
      const room = await roomOf(owner, leaver);
      await updateRoomSettings({ matchThreshold: 2, requireMajority: false }, user(owner));
      await swipe({ movieId: 7, direction: "LIKE" }, user(leaver));

      await Promise.all([leaveRoom({}, user(leaver)), undoSwipe({ movieId: 7 }, user(leaver))]);

      expect(table.row(`ROOM#${room.id}`, "TALLY#1#7")?.likes).toBe(0);
    }
  });

  it("doesn't leak a like from a swipe racing the leave", async () => {
    for (let trial = 0; trial < 10; trial += 1) {
      const owner = `host${trial}`;
      const leaver = `racer${trial}`;
      const room = await roomOf(owner, leaver);

      await Promise.all([
        leaveRoom({}, user(leaver)),
        swipe({ movieId: 7, direction: "LIKE" }, user(leaver)),
      ]);

      const pk = `ROOM#${room.id}`;
      expect(table.find(pk, `SWIPE#1#sub-${leaver}#`)).toEqual([]);
      expect(table.row(pk, "TALLY#1#7")?.likes ?? 0).toBe(0);
    }
  });

  it("catches a swipe that lands between the first cleanup and the move", async () => {
    const room = await roomOf("ann", "bob");
    table.beforeTransaction(async (items) => {
      if (!items[0]?.Update?.ConditionExpression?.startsWith("roomId")) return false;
      await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
      return true;
    });

    await leaveRoom({}, user("bob"));

    const pk = `ROOM#${room.id}`;
    expect(table.find(pk, "SWIPE#")).toEqual([]);
    expect(table.row(pk, "TALLY#1#7")?.likes).toBe(0);
  });

  it("re-evaluates tallies when a departure lowers the threshold", async () => {
    const room = await roomOf("ann", "bob", "cat");
    await updateRoomSettings({ matchThreshold: 3, requireMajority: false }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toEqual([]);

    await leaveRoom({}, user("cat"));

    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toHaveLength(1);
    expect(eventsOfType("MATCH_FOUND")).toEqual([
      expect.objectContaining({ roomId: room.id, movieId: 7, actorId: "sub-cat" }),
    ]);
  });

  it("doesn't count the leaver's like in that re-evaluation", async () => {
    const room = await roomOf("ann", "bob", "cat");
    await updateRoomSettings({ matchThreshold: 3, requireMajority: false }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    await swipe({ movieId: 7, direction: "LIKE" }, user("cat"));

    await leaveRoom({}, user("cat"));

    expect(table.find(`ROOM#${room.id}`, "MATCH#")).toEqual([]);
    expect(table.row(`ROOM#${room.id}`, "TALLY#1#7")?.likes).toBe(1);
  });

  it("keeps the room joinable after everyone has gone", async () => {
    const room = await myRoom({}, user("ann"));
    await leaveRoom({}, user("ann"));
    await expect(joinRoom({ code: room.code }, user("bob"))).resolves.toMatchObject({
      id: room.id,
      members: [{ userId: "sub-bob" }],
    });
  });

  it("succeeds even if the follow-up after the move fails", async () => {
    const room = await roomOf("ann", "bob");
    publishRoomEvent.mockClear();
    table.onCommit((items) => {
      if (items[0]?.Update?.ConditionExpression?.startsWith("roomId")) {
        table.failQueriesUnder = "SWIPE#";
      }
    });

    const fresh = await leaveRoom({}, user("bob"));

    expect(fresh.members.map((member) => member.userId)).toEqual(["sub-bob"]);
    expect(table.row(`ROOM#${room.id}`, "MEMBER#sub-bob")).toBeUndefined();
    expect(eventsOfType("MEMBERS_CHANGED")).toHaveLength(2);
    expect(console.error).toHaveBeenCalled();
  });

  it("changes nothing if the cleanup before the move fails", async () => {
    const room = await roomOf("ann", "bob");
    table.failQueriesUnder = "SWIPE#";
    await expect(leaveRoom({}, user("bob"))).rejects.toThrow();
    table.failQueriesUnder = undefined;
    expect(table.row("USER#sub-bob", "PROFILE")?.roomId).toBe(room.id);
    expect(table.row(`ROOM#${room.id}`, "MEMBER#sub-bob")).toBeDefined();
  });
});
