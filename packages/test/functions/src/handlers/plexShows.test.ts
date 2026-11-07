import type { Show } from "@movie-date/core";
import { plexStatus } from "@movie-date/functions/handlers/plexStatus";
import { requestOnPlex } from "@movie-date/functions/handlers/requestOnPlex";
import { ValidationError } from "@movie-date/functions/lib/errors";
import { showPresence } from "@movie-date/functions/lib/plexIndex";
import { getShowRecord } from "@movie-date/functions/lib/tmdbTv";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { fakePlexRequest, type IntegrationCall } from "../support/plexRequestFake";
import { showNamed, user } from "../support/roomFixture";

vi.mock("@movie-date/functions/lib/tmdbTv", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/tmdbTv")>()),
  getShowRecord: vi.fn(),
}));
vi.mock("@movie-date/functions/lib/plexIndex", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/plexIndex")>()),
  showPresence: vi.fn(),
}));

const ANA = user("ana");
const SHOW_ID = 1396;
const TVDB_ID = 81189;
const TV = { mediaType: "TV" } as const;
const CREATED = { outcome: "created", requestId: "r1", status: "requested", autoApproved: false };
const NOT_ANYWHERE = { inLibrary: false, hasFile: false, activeRequest: null };
const REQUESTABLE = { availability: "NOT_IN_LIBRARY", canRequest: true };

const plexRequest = fakePlexRequest();
let dynamo: FakeDynamo;

function givenRecord(tvdbId: number | null, overrides: Partial<Show> = {}): void {
  vi.mocked(getShowRecord).mockResolvedValue({
    show: showNamed(SHOW_ID, { seasonCount: 4, posterUrl: "https://image.tmdb.org/t/p/w780/poster.jpg", ...overrides }),
    providerIds: [],
    tvdbId,
  });
}

function givenLive(state: Record<string, unknown>): void {
  plexRequest.answer(({ op }: IntegrationCall) => (op === "showStatus" ? state : CREATED));
}

function limitRows(): unknown[] {
  return dynamo.find("USER#sub-ana", "LIMIT#");
}

beforeEach(() => {
  dynamo = new FakeDynamo();
  plexRequest.reset();
  process.env.PLEX_INTEGRATION_FUNCTION = "integration";
  dynamo.seed({
    pk: "USER#sub-ana",
    sk: "PROFILE",
    email: "ana@example.com",
    displayName: "ana",
    roomId: "room-ana",
    createdAt: "2026-01-01T00:00:00.000Z",
    plexUserId: "plex-ana",
    plexEmail: "ana@plex.example.com",
  });
  vi.mocked(showPresence).mockResolvedValue("ABSENT");
  givenRecord(TVDB_ID);
  givenLive(NOT_ANYWHERE);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  dynamo.restore();
  vi.restoreAllMocks();
});

afterAll(() => {
  plexRequest.restore();
});

describe("a show's Plex status", () => {
  const status = () => plexStatus({ movieId: SHOW_ID, ...TV }, ANA);

  it("answers from the index for a show it has, with no invocation", async () => {
    vi.mocked(showPresence).mockResolvedValue("WATCHABLE");
    expect(await status()).toEqual({ availability: "AVAILABLE", canRequest: false });
    vi.mocked(showPresence).mockResolvedValue("WAITING");
    expect(await status()).toEqual({ availability: "MONITORED", canRequest: false });
    expect(plexRequest.calls).toEqual([]);
  });

  it("offers a request for a show nobody has, asking by TVDB id as the caller", async () => {
    expect(await status()).toEqual({ ...REQUESTABLE, seasonCount: 4 });
    expect(plexRequest.callsTo("showStatus")).toEqual([{ op: "showStatus", tvdbId: TVDB_ID, userId: "plex-ana" }]);
  });

  it("reports an active request", async () => {
    givenLive({ ...NOT_ANYWHERE, activeRequest: { status: "approved", requestedByUser: false } });
    expect(await status()).toEqual({ availability: "REQUESTED", canRequest: false });
  });

  it("reports a show added since the index was built", async () => {
    givenLive({ ...NOT_ANYWHERE, inLibrary: true });
    expect(await status()).toEqual({ availability: "MONITORED", canRequest: false });
  });

  it("can't offer a show with no TVDB id, and never asks about it", async () => {
    givenRecord(null);
    expect(await status()).toEqual({ availability: "NOT_IN_LIBRARY", canRequest: false });
    expect(plexRequest.calls).toEqual([]);
  });

  it("degrades quietly when Plex Request can't be reached", async () => {
    plexRequest.breakIt();
    expect(await status()).toEqual({ availability: "NOT_IN_LIBRARY", canRequest: false });
  });
});

describe("requesting a show", () => {
  it("sends the TVDB id and never a tmdbId, as the linked account", async () => {
    expect(await requestOnPlex({ movieId: SHOW_ID, ...TV }, ANA)).toEqual({ availability: "REQUESTED", canRequest: false });
    const [sent] = plexRequest.callsTo("createRequest");
    expect(sent).toEqual({
      op: "createRequest",
      userId: "plex-ana",
      email: "ana@plex.example.com",
      mediaType: "tv",
      tvdbId: TVDB_ID,
      title: showNamed(SHOW_ID).title,
      year: String(showNamed(SHOW_ID).firstAirYear),
      overview: showNamed(SHOW_ID).overview,
      posterPath: "/poster.jpg",
    });
    expect(sent).not.toHaveProperty("tmdbId");
  });

  it("sends a subset of seasons sorted and without repeats", async () => {
    await requestOnPlex({ movieId: SHOW_ID, ...TV, seasons: [3, 1, 3] }, ANA);
    expect(plexRequest.callsTo("createRequest")[0]?.seasons).toEqual([1, 3]);
  });

  it("leaves seasons off when all of them are chosen", async () => {
    await requestOnPlex({ movieId: SHOW_ID, ...TV, seasons: [1, 2, 3, 4] }, ANA);
    expect(plexRequest.callsTo("createRequest")[0]).not.toHaveProperty("seasons");
  });

  it.each([[[]], [[0]], [[5]], [[1.5]]])("rejects seasons %j before spending the limit", async (seasons) => {
    await expect(requestOnPlex({ movieId: SHOW_ID, ...TV, seasons }, ANA)).rejects.toBeInstanceOf(ValidationError);
    expect(limitRows()).toEqual([]);
    expect(plexRequest.callsTo("createRequest")).toEqual([]);
  });

  it("counts a timed-out request as sent, keeping the limit spent", async () => {
    plexRequest.answer(({ op }: IntegrationCall) => {
      if (op === "showStatus") return NOT_ANYWHERE;
      throw Object.assign(new Error("gave up"), { name: "TimeoutError" });
    });
    expect(await requestOnPlex({ movieId: SHOW_ID, ...TV }, ANA)).toEqual({ availability: "REQUESTED", canRequest: false });
    expect(limitRows()).toEqual([expect.objectContaining({ count: 1 })]);
  });

  it("rejects seasons on a movie before asking anyone", async () => {
    await expect(requestOnPlex({ movieId: SHOW_ID, seasons: [1] }, ANA)).rejects.toBeInstanceOf(ValidationError);
    expect(plexRequest.calls).toEqual([]);
  });

  it("sends nothing for a show already requested or in the library", async () => {
    givenLive({ ...NOT_ANYWHERE, activeRequest: { status: "requested", requestedByUser: true } });
    expect((await requestOnPlex({ movieId: SHOW_ID, ...TV }, ANA)).availability).toBe("REQUESTED");
    vi.mocked(showPresence).mockResolvedValue("WATCHABLE");
    expect((await requestOnPlex({ movieId: SHOW_ID, ...TV }, ANA)).availability).toBe("AVAILABLE");
    expect(plexRequest.callsTo("createRequest")).toEqual([]);
  });
});
