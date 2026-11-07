import type { Movie } from "@movie-date/core";
import { plexStatus } from "@movie-date/functions/handlers/plexStatus";
import { requestOnPlex } from "@movie-date/functions/handlers/requestOnPlex";
import { ForbiddenError, RateLimitedError, UpstreamError, ValidationError } from "@movie-date/functions/lib/errors";
import { hasFileOnPlex } from "@movie-date/functions/lib/plexIndex";
import { getMovie } from "@movie-date/functions/lib/tmdb";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { fakePlexRequest, type IntegrationCall } from "../support/plexRequestFake";
import { user } from "../support/roomFixture";

vi.mock("@movie-date/functions/lib/tmdb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/tmdb")>()),
  getMovie: vi.fn(),
}));
vi.mock("@movie-date/functions/lib/plexIndex", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/plexIndex")>()),
  hasFileOnPlex: vi.fn(),
}));

const ANA = user("ana");
const BEN = user("ben");
const MOVIE_ID = 550;

const MOVIE: Movie = {
  id: MOVIE_ID,
  title: "Fight Club",
  overview: "An overview.",
  releaseYear: 1999,
  runtime: 139,
  voteAverage: 8.4,
  posterUrl: "https://image.tmdb.org/t/p/w780/poster.jpg",
  backdropUrl: null,
  genres: ["Drama"],
};

const plexRequest = fakePlexRequest();
let dynamo: FakeDynamo;

function givenLinked(name: string): void {
  dynamo.seed({
    pk: `USER#sub-${name}`,
    sk: "PROFILE",
    email: `${name}@example.com`,
    displayName: name,
    roomId: `room-${name}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    plexUserId: `plex-${name}`,
    plexEmail: `${name}@plex.example.com`,
  });
}

function givenUnlinked(name: string): void {
  dynamo.seed({
    pk: `USER#sub-${name}`,
    sk: "PROFILE",
    email: `${name}@example.com`,
    displayName: name,
    roomId: `room-${name}`,
    createdAt: "2026-01-01T00:00:00.000Z",
  });
}

function givenState(state: Record<string, unknown>): void {
  plexRequest.answer(({ op }: IntegrationCall) => (op === "movieStatus" ? state : CREATED));
}

const CREATED = { outcome: "created", requestId: "r1", status: "requested", autoApproved: false };
const NOT_ANYWHERE = { inLibrary: false, hasFile: false, activeRequest: null };

beforeEach(() => {
  dynamo = new FakeDynamo();
  plexRequest.reset();
  process.env.PLEX_INTEGRATION_FUNCTION = "integration";
  vi.mocked(getMovie).mockResolvedValue(MOVIE);
  vi.mocked(hasFileOnPlex).mockResolvedValue(false);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  dynamo.restore();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(() => {
  plexRequest.restore();
});

describe("plexStatus", () => {
  it("is null for a caller who hasn't linked", async () => {
    givenUnlinked("ana");
    expect(await plexStatus({ movieId: MOVIE_ID }, ANA)).toBeNull();
    expect(plexRequest.calls).toEqual([]);
  });

  it.each([
    [{ inLibrary: true, hasFile: true, activeRequest: null }, "AVAILABLE", false],
    [{ inLibrary: true, hasFile: false, activeRequest: null }, "MONITORED", false],
    [{ inLibrary: true, hasFile: false, activeRequest: { status: "approved" } }, "REQUESTED", false],
    [{ inLibrary: false, hasFile: false, activeRequest: { status: "requested" } }, "REQUESTED", false],
    [NOT_ANYWHERE, "NOT_IN_LIBRARY", true],
  ])("reads %j as %s", async (state, availability, canRequest) => {
    givenLinked("ana");
    givenState(state);
    expect(await plexStatus({ movieId: MOVIE_ID }, ANA)).toEqual({ availability, canRequest });
  });

  it("asks about the caller's own account", async () => {
    givenLinked("ana");
    givenState(NOT_ANYWHERE);
    await plexStatus({ movieId: MOVIE_ID }, ANA);
    expect(plexRequest.calls).toEqual([{ op: "movieStatus", tmdbId: MOVIE_ID, userId: "plex-ana" }]);
  });

  it("spends no invocation on a title the index already has", async () => {
    givenLinked("ana");
    vi.mocked(hasFileOnPlex).mockResolvedValue(true);
    expect(await plexStatus({ movieId: MOVIE_ID }, ANA)).toEqual({
      availability: "AVAILABLE",
      canRequest: false,
    });
    expect(plexRequest.calls).toEqual([]);
  });

  it("degrades quietly when Plex Request can't be reached", async () => {
    givenLinked("ana");
    plexRequest.breakIt();
    expect(await plexStatus({ movieId: MOVIE_ID }, ANA)).toEqual({
      availability: "NOT_IN_LIBRARY",
      canRequest: false,
    });
  });

  it("rejects a bad id", async () => {
    await expect(plexStatus({ movieId: 0 }, ANA)).rejects.toBeInstanceOf(ValidationError);
  });
});

describe("requestOnPlex", () => {
  it("is refused for a caller who hasn't linked", async () => {
    givenUnlinked("ana");
    await expect(requestOnPlex({ movieId: MOVIE_ID }, ANA)).rejects.toBeInstanceOf(ForbiddenError);
    expect(plexRequest.calls).toEqual([]);
  });

  it("sends the title's details as the caller's linked account", async () => {
    givenLinked("ana");
    givenState(NOT_ANYWHERE);
    expect(await requestOnPlex({ movieId: MOVIE_ID }, ANA)).toEqual({
      availability: "REQUESTED",
      canRequest: false,
    });
    expect(plexRequest.callsTo("createRequest")).toEqual([
      {
        op: "createRequest",
        userId: "plex-ana",
        email: "ana@plex.example.com",
        tmdbId: MOVIE_ID,
        title: "Fight Club",
        year: "1999",
        overview: "An overview.",
        posterPath: "/poster.jpg",
      },
    ]);
  });

  it("copes with a title missing a poster and year", async () => {
    givenLinked("ana");
    givenState(NOT_ANYWHERE);
    vi.mocked(getMovie).mockResolvedValue({ ...MOVIE, posterUrl: null, releaseYear: null });
    await requestOnPlex({ movieId: MOVIE_ID }, ANA);
    expect(plexRequest.callsTo("createRequest")[0]).toMatchObject({ posterPath: "", year: "" });
  });

  it("always acts as the identity on the call", async () => {
    givenLinked("ana");
    givenLinked("ben");
    givenState(NOT_ANYWHERE);
    // Extra arguments can't get past the schema, but nothing here may read them anyway.
    const forged = { movieId: MOVIE_ID, userId: "plex-ana", email: "ana@plex.example.com" };
    await requestOnPlex(forged, BEN);
    expect(plexRequest.callsTo("createRequest")[0]).toMatchObject({
      userId: "plex-ben",
      email: "ben@plex.example.com",
    });
  });

  it("doesn't let an unlinked caller ride on a linked roommate", async () => {
    givenLinked("ana");
    givenUnlinked("ben");
    await expect(requestOnPlex({ movieId: MOVIE_ID }, BEN)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it.each([
    [{ inLibrary: false, hasFile: false, activeRequest: { status: "requested" } }, "REQUESTED"],
    [{ inLibrary: true, hasFile: false, activeRequest: null }, "MONITORED"],
    [{ inLibrary: true, hasFile: true, activeRequest: null }, "AVAILABLE"],
  ])("makes no new request for %j", async (state, availability) => {
    givenLinked("ana");
    givenState(state);
    expect(await requestOnPlex({ movieId: MOVIE_ID }, ANA)).toEqual({ availability, canRequest: false });
    expect(plexRequest.callsTo("createRequest")).toEqual([]);
    expect(dynamo.find("USER#sub-ana", "LIMIT#plex-request")).toEqual([]);
  });

  it("reports a duplicate that slipped in after the check as REQUESTED", async () => {
    givenLinked("ana");
    plexRequest.answer(({ op }) => (op === "movieStatus" ? NOT_ANYWHERE : { outcome: "duplicate" }));
    expect(await requestOnPlex({ movieId: MOVIE_ID }, ANA)).toEqual({
      availability: "REQUESTED",
      canRequest: false,
    });
  });

  it("says Plex Request is unavailable rather than failing obscurely", async () => {
    givenLinked("ana");
    plexRequest.breakIt();
    const failure = await requestOnPlex({ movieId: MOVIE_ID }, ANA).catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(UpstreamError);
    expect((failure as Error).message).toBe("Plex Request is unavailable right now.");
  });

  it("doesn't charge the limit for a title TMDB can't find", async () => {
    givenLinked("ana");
    givenState(NOT_ANYWHERE);
    vi.mocked(getMovie).mockRejectedValue(new ValidationError());
    await expect(requestOnPlex({ movieId: MOVIE_ID }, ANA)).rejects.toBeInstanceOf(ValidationError);
    expect(dynamo.find("USER#sub-ana", "LIMIT#plex-request")).toEqual([]);
  });
});

describe("daily request limit", () => {
  async function requestTimes(count: number, caller = ANA): Promise<void> {
    for (let movieId = 1; movieId <= count; movieId += 1) {
      await requestOnPlex({ movieId }, caller);
    }
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-01T10:00:00Z") });
    givenLinked("ana");
    givenLinked("ben");
    givenState(NOT_ANYWHERE);
  });

  it("stops at 10 per user per day", async () => {
    await requestTimes(10);
    await expect(requestOnPlex({ movieId: 11 }, ANA)).rejects.toBeInstanceOf(RateLimitedError);
    expect(plexRequest.callsTo("createRequest")).toHaveLength(10);
  });

  it("keeps one user's limit from touching another's", async () => {
    await requestTimes(10);
    await expect(requestOnPlex({ movieId: 11 }, BEN)).resolves.toMatchObject({ availability: "REQUESTED" });
  });

  it("resets the next day", async () => {
    await requestTimes(10);
    vi.setSystemTime(new Date("2026-03-02T00:00:01Z"));
    await expect(requestOnPlex({ movieId: 11 }, ANA)).resolves.toMatchObject({ availability: "REQUESTED" });
  });

  it("holds under parallel presses", async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 15 }, (_, index) => requestOnPlex({ movieId: index + 1 }, ANA)),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(10);
    expect(plexRequest.callsTo("createRequest")).toHaveLength(10);
  });

  it("gives back a unit when Plex Request fails partway", async () => {
    await requestTimes(9);
    plexRequest.answer(({ op }) => {
      if (op === "movieStatus") return NOT_ANYWHERE;
      throw new Error("Radarr is down");
    });
    await expect(requestOnPlex({ movieId: 10 }, ANA)).rejects.toBeInstanceOf(UpstreamError);
    givenState(NOT_ANYWHERE);
    await expect(requestOnPlex({ movieId: 10 }, ANA)).resolves.toMatchObject({ availability: "REQUESTED" });
  });
});
