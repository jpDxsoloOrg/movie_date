import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { handler } from "@movie-date/functions/plexIndexJob";
import type { LibraryMovie } from "@movie-date/functions/lib/plexIndex";
import { getLibraryDetails, type LibraryDetails } from "@movie-date/functions/lib/tmdb";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "./support/fakeDynamo";
import { fakePlexRequest } from "./support/plexRequestFake";

vi.mock("@movie-date/functions/lib/tmdb", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/tmdb")>()),
  getLibraryDetails: vi.fn(),
}));

const PLENTY_OF_TIME = { getRemainingTimeInMillis: () => 600_000 };
const DETAILS: LibraryDetails = { genreIds: [18], castIds: [287], releaseDate: "1999-10-15", popularity: 60 };

const s3 = mockClient(S3Client);
const plexRequest = fakePlexRequest();
let dynamo: FakeDynamo;
let stored: LibraryMovie[] | "missing" | "unreadable";

function indexed(id: number, hasFile = true): LibraryMovie {
  return { id, hasFile, ...DETAILS };
}

function givenLibrary(entries: { tmdbId: number; hasFile: boolean }[] | unknown): void {
  plexRequest.answer(() => entries);
}

function savedMovies(): LibraryMovie[] | undefined {
  const put = s3.commandCalls(PutObjectCommand).at(-1);
  if (!put) return undefined;
  return (JSON.parse(String(put.args[0].input.Body)) as { movies: LibraryMovie[] }).movies;
}

function savedIds(): number[] | undefined {
  return savedMovies()?.map((movie) => movie.id).sort((first, second) => first - second);
}

beforeEach(() => {
  dynamo = new FakeDynamo();
  plexRequest.reset();
  s3.reset();
  stored = "missing";
  process.env.PLEX_INTEGRATION_FUNCTION = "integration";
  process.env.PLEX_INDEX_BUCKET = "index-bucket";
  s3.on(GetObjectCommand).callsFake(async () => {
    if (stored === "missing") throw Object.assign(new Error("Gone"), { name: "NoSuchKey" });
    if (stored === "unreadable") throw Object.assign(new Error("Slow down"), { name: "SlowDown" });
    const body = JSON.stringify({ generatedAt: "2026-03-01T00:00:00.000Z", movies: stored });
    return { Body: { transformToString: async () => body } };
  });
  s3.on(PutObjectCommand).resolves({});
  vi.mocked(getLibraryDetails).mockResolvedValue(DETAILS);
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  dynamo.restore();
  vi.restoreAllMocks();
});

afterAll(() => {
  s3.restore();
  plexRequest.restore();
});

describe("building the index", () => {
  it("stores a compact record per library title", async () => {
    givenLibrary([{ tmdbId: 550, hasFile: true }]);
    const result = await handler({}, PLENTY_OF_TIME);
    expect(savedMovies()).toEqual([
      { id: 550, genreIds: [18], castIds: [287], releaseDate: "1999-10-15", popularity: 60, hasFile: true },
    ]);
    expect(result).toEqual({ skipped: false, total: 1, added: 1, failed: 0 });
    expect(s3.commandCalls(PutObjectCommand)[0]?.args[0].input.Bucket).toBe("index-bucket");
  });

  it("only fetches titles it hasn't seen", async () => {
    stored = [indexed(1)];
    givenLibrary([{ tmdbId: 1, hasFile: true }, { tmdbId: 2, hasFile: true }]);
    await handler({}, PLENTY_OF_TIME);
    expect(vi.mocked(getLibraryDetails).mock.calls).toEqual([[2]]);
    expect(savedIds()).toEqual([1, 2]);
  });

  it("drops titles the library lost", async () => {
    stored = [indexed(1), indexed(2)];
    givenLibrary([{ tmdbId: 2, hasFile: true }]);
    await handler({}, PLENTY_OF_TIME);
    expect(savedIds()).toEqual([2]);
  });

  it("picks up a file arriving or leaving on a title it already knows", async () => {
    stored = [indexed(1, false), indexed(2, true)];
    givenLibrary([{ tmdbId: 1, hasFile: true }, { tmdbId: 2, hasFile: false }]);
    await handler({}, PLENTY_OF_TIME);
    const byId = new Map(savedMovies()?.map((movie) => [movie.id, movie.hasFile]));
    expect(byId).toEqual(new Map([[1, true], [2, false]]));
    expect(getLibraryDetails).not.toHaveBeenCalled();
  });

  it("ignores duplicate and invalid ids from upstream", async () => {
    givenLibrary([
      { tmdbId: 5, hasFile: true },
      { tmdbId: 5, hasFile: true },
      { tmdbId: 0, hasFile: true },
      { tmdbId: "7", hasFile: true },
    ]);
    await handler({}, PLENTY_OF_TIME);
    expect(savedIds()).toEqual([5]);
  });
});

describe("the account's concurrency", () => {
  it("runs in this one invocation, with at most 4 TMDB calls in flight", async () => {
    givenLibrary(Array.from({ length: 30 }, (_, index) => ({ tmdbId: index + 1, hasFile: true })));
    let inFlight = 0;
    let highest = 0;
    vi.mocked(getLibraryDetails).mockImplementation(async () => {
      inFlight += 1;
      highest = Math.max(highest, inFlight);
      await new Promise((resolve) => setImmediate(resolve));
      inFlight -= 1;
      return DETAILS;
    });
    await handler({}, PLENTY_OF_TIME);
    expect(highest).toBe(4);
    expect(savedIds()).toHaveLength(30);
    expect(plexRequest.calls).toEqual([{ op: "libraryMovies" }]);
  });

  it("won't overlap another run", async () => {
    dynamo.seed({
      pk: "PLEX#INDEX",
      sk: "LEASE",
      expiresAt: Math.floor(Date.now() / 1000) + 300,
    });
    givenLibrary([{ tmdbId: 1, hasFile: true }]);
    expect(await handler({}, PLENTY_OF_TIME)).toEqual({ skipped: true, total: 0, added: 0, failed: 0 });
    expect(plexRequest.calls).toEqual([]);
  });

  it("takes over from a run that crashed", async () => {
    dynamo.seed({ pk: "PLEX#INDEX", sk: "LEASE", expiresAt: Math.floor(Date.now() / 1000) - 1 });
    givenLibrary([{ tmdbId: 1, hasFile: true }]);
    expect((await handler({}, PLENTY_OF_TIME)).skipped).toBe(false);
  });

  it("gives the lease back when it's done, and when it fails", async () => {
    givenLibrary([{ tmdbId: 1, hasFile: true }]);
    await handler({}, PLENTY_OF_TIME);
    expect(dynamo.row("PLEX#INDEX", "LEASE")).toBeUndefined();
    plexRequest.breakIt();
    await expect(handler({}, PLENTY_OF_TIME)).rejects.toThrow();
    expect(dynamo.row("PLEX#INDEX", "LEASE")).toBeUndefined();
  });

  it("saves what it has and stops when time runs short", async () => {
    givenLibrary(Array.from({ length: 30 }, (_, index) => ({ tmdbId: index + 1, hasFile: true })));
    let remaining = 62_000;
    const shrinking = { getRemainingTimeInMillis: () => (remaining -= 200) };
    const result = await handler({}, shrinking);
    expect(result.added).toBeGreaterThan(0);
    expect(result.added).toBeLessThan(30);
    expect(savedIds()).toHaveLength(result.added);
  });
});

describe("failures keep the last good index", () => {
  beforeEach(() => {
    stored = [indexed(1), indexed(2)];
  });

  it("when Plex Request can't be reached", async () => {
    plexRequest.breakIt();
    await expect(handler({}, PLENTY_OF_TIME)).rejects.toThrow();
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("when the answer isn't a list", async () => {
    givenLibrary({ surprise: true });
    await expect(handler({}, PLENTY_OF_TIME)).rejects.toThrow();
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("when a populated library suddenly reads empty", async () => {
    givenLibrary([]);
    await expect(handler({}, PLENTY_OF_TIME)).rejects.toThrow();
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("when the stored index can't be read, so nothing is refetched or lost", async () => {
    stored = "unreadable";
    givenLibrary([{ tmdbId: 1, hasFile: true }]);
    await expect(handler({}, PLENTY_OF_TIME)).rejects.toThrow();
    expect(getLibraryDetails).not.toHaveBeenCalled();
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });

  it("keeping known titles when TMDB fails on new ones, to retry next run", async () => {
    givenLibrary([{ tmdbId: 1, hasFile: true }, { tmdbId: 2, hasFile: true }, { tmdbId: 3, hasFile: true }]);
    vi.mocked(getLibraryDetails).mockRejectedValue(new Error("TMDB is down"));
    expect(await handler({}, PLENTY_OF_TIME)).toMatchObject({ total: 2, added: 0, failed: 1 });
    expect(savedIds()).toEqual([1, 2]);
  });

  it("writing nothing rather than an empty index on a first run that fails", async () => {
    stored = "missing";
    givenLibrary([{ tmdbId: 1, hasFile: true }]);
    vi.mocked(getLibraryDetails).mockRejectedValue(new Error("TMDB is down"));
    await handler({}, PLENTY_OF_TIME);
    expect(s3.commandCalls(PutObjectCommand)).toHaveLength(0);
  });
});
