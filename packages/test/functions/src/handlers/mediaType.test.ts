import { matches } from "@movie-date/functions/handlers/matches";
import { myRoom } from "@movie-date/functions/handlers/myRoom";
import { pendingMatch } from "@movie-date/functions/handlers/pendingMatch";
import { swipe } from "@movie-date/functions/handlers/swipe";
import { swipeHistory } from "@movie-date/functions/handlers/swipeHistory";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { movieNamed, roomOf, user } from "../support/roomFixture";

vi.mock("@movie-date/functions/src/lib/events.ts", () => ({
  publishRoomEvent: async () => undefined,
  revokeRoomSubscriptions: async () => undefined,
}));
vi.mock("@movie-date/functions/src/lib/tmdb.ts", () => ({
  getMovie: async (id: number) => movieNamed(id),
}));

const MATCHED_AT = "2026-01-01T00:00:00.000Z";
const noFilters = { genreIds: [], cast: [], services: [] };

let table: FakeDynamo;

beforeEach(() => {
  table = new FakeDynamo();
});

afterEach(() => {
  table.restore();
});

/** The shape of every keyed row in the live table: the id with no type in front. */
function seedBareMatch(roomId: string): void {
  const pk = `ROOM#${roomId}`;
  const sk = `MATCH#${MATCHED_AT}#550`;
  const movie = movieNamed(550);
  table.seed({ pk, sk, matchId: "old-match", movieId: 550, round: 1, matchedAt: MATCHED_AT, movie });
  table.seed({ pk, sk: "MATCHED#1#550", matchId: "old-match", movieId: 550, matchSk: sk });
}

describe("rows from before Going Steady", () => {
  it("reads a bare-id match as a movie", async () => {
    const room = await roomOf("ann");
    seedBareMatch(room.id);
    await expect(matches({}, user("ann"))).resolves.toMatchObject({
      matches: [{ id: "old-match", mediaType: "MOVIE", show: null, movie: { id: 550 } }],
    });
    await expect(pendingMatch({}, user("ann"))).resolves.toMatchObject({ mediaType: "MOVIE" });
  });

  it("reads a bare-id swipe as a movie", async () => {
    const room = await roomOf("ann");
    table.seed({
      pk: `ROOM#${room.id}`,
      sk: "SWIPE#1#sub-ann#550",
      movieId: 550,
      direction: "LIKE",
      swipedAt: MATCHED_AT,
      movie: movieNamed(550),
    });
    await expect(swipeHistory({}, user("ann"))).resolves.toMatchObject({
      entries: [{ mediaType: "MOVIE", show: null, movie: { id: 550 } }],
    });
  });

  it("gives a room with no TV attributes a first round and empty filters", async () => {
    const room = await roomOf("ann");
    const meta = table.row(`ROOM#${room.id}`, "META");
    expect(meta).not.toHaveProperty("tvRound");
    expect(meta).not.toHaveProperty("tvFilters");
    await expect(myRoom({}, user("ann"))).resolves.toMatchObject({ tvRound: 1, tvFilters: noFilters });
  });
});

describe("an explicit null mediaType", () => {
  it("means movies, since a null skips the schema default", async () => {
    await roomOf("ann");
    await expect(
      swipe({ movieId: 7, direction: "PASS", mediaType: null }, user("ann")),
    ).resolves.toMatchObject({ mediaType: "MOVIE" });
  });
});
