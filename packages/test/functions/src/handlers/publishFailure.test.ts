import { joinRoom } from "@movie-date/functions/handlers/joinRoom";
import { startNewRound } from "@movie-date/functions/handlers/startNewRound";
import { swipe } from "@movie-date/functions/handlers/swipe";
import { updateFilters } from "@movie-date/functions/handlers/updateFilters";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { movieNamed, roomOf, user } from "../support/roomFixture";

const getMovie = vi.hoisted(() => vi.fn());
vi.mock("@movie-date/functions/src/lib/tmdb.ts", () => ({ getMovie }));

let table: FakeDynamo;

beforeEach(() => {
  table = new FakeDynamo();
  getMovie.mockImplementation(async (movieId: number) => movieNamed(movieId));
  vi.stubEnv("GRAPHQL_URL", "https://example.appsync-api.us-east-1.amazonaws.com/graphql");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("AppSync is down")));
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  table.restore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("when AppSync can't be reached", () => {
  it("still completes the match for the swiper", async () => {
    await roomOf("ann", "bob");
    await swipe({ movieId: 7, direction: "LIKE" }, user("ann"));
    const result = await swipe({ movieId: 7, direction: "LIKE" }, user("bob"));
    expect(result.match).not.toBeNull();
    expect(fetch).toHaveBeenCalled();
    expect(console.error).toHaveBeenCalled();
  });

  it("still completes every other mutation that publishes", async () => {
    const room = await roomOf("ann");
    await expect(joinRoom({ code: room.code }, user("bob"))).resolves.toBeDefined();
    await expect(
      updateFilters({ filters: { genreIds: [], cast: [], services: [] } }, user("bob")),
    ).resolves.toBeDefined();
    await expect(startNewRound({ expectedRound: 1 }, user("bob"))).resolves.toMatchObject({
      round: 2,
    });
  });
});
