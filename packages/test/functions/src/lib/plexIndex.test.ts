import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const s3 = mockClient(S3Client);

function storedIndex(ids: number[]) {
  const body = JSON.stringify({
    generatedAt: "2026-03-01T00:00:00.000Z",
    movies: ids.map((id) => ({
      id,
      genreIds: [],
      castIds: [],
      releaseDate: null,
      popularity: 1,
      hasFile: id !== 99,
    })),
  });
  return { Body: { transformToString: async () => body } } as never;
}

/** The module keeps its last read, so each test needs a fresh copy. */
async function freshModule() {
  vi.resetModules();
  return import("@movie-date/functions/lib/plexIndex");
}

beforeEach(() => {
  s3.reset();
  process.env.PLEX_INDEX_BUCKET = "index-bucket";
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

afterAll(() => {
  s3.restore();
});

describe("loadLibraryIndex", () => {
  it("is null before the first job has run", async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error("Gone"), { name: "NoSuchKey" }));
    const { loadLibraryIndex } = await freshModule();
    expect(await loadLibraryIndex()).toBeNull();
  });

  it("reads the store once for a burst of deck pages", async () => {
    s3.on(GetObjectCommand).resolves(storedIndex([1]));
    const { loadLibraryIndex } = await freshModule();
    await loadLibraryIndex();
    await loadLibraryIndex();
    expect(s3.commandCalls(GetObjectCommand)).toHaveLength(1);
  });

  it("picks up a new index after a few minutes", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-01T10:00:00Z") });
    s3.on(GetObjectCommand).resolves(storedIndex([1]));
    const { loadLibraryIndex } = await freshModule();
    await loadLibraryIndex();
    s3.on(GetObjectCommand).resolves(storedIndex([2]));
    vi.setSystemTime(new Date("2026-03-01T10:06:00Z"));
    expect((await loadLibraryIndex())?.movies[0]?.id).toBe(2);
  });

  it("serves the last copy through a read failure", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-01T10:00:00Z") });
    s3.on(GetObjectCommand).resolves(storedIndex([1]));
    const { loadLibraryIndex } = await freshModule();
    await loadLibraryIndex();
    s3.on(GetObjectCommand).rejects(new Error("S3 is down"));
    vi.setSystemTime(new Date("2026-03-01T10:06:00Z"));
    expect((await loadLibraryIndex())?.movies[0]?.id).toBe(1);
  });

  it("is null when it has never read one and the store is down", async () => {
    s3.on(GetObjectCommand).rejects(new Error("S3 is down"));
    const { loadLibraryIndex } = await freshModule();
    expect(await loadLibraryIndex()).toBeNull();
  });

  it("treats a corrupt object as a failure, not an empty library", async () => {
    s3.on(GetObjectCommand).resolves({ Body: { transformToString: async () => "{}" } } as never);
    const { loadLibraryIndex, readLibraryIndex } = await freshModule();
    expect(await loadLibraryIndex()).toBeNull();
    await expect(readLibraryIndex()).rejects.toThrow();
  });
});

describe("hasFileOnPlex", () => {
  it("is true only for an indexed title with a file", async () => {
    s3.on(GetObjectCommand).resolves(storedIndex([1, 99]));
    const { hasFileOnPlex } = await freshModule();
    expect(await hasFileOnPlex(1)).toBe(true);
    expect(await hasFileOnPlex(99)).toBe(false);
    expect(await hasFileOnPlex(2)).toBe(false);
  });

  it("is false with no index", async () => {
    s3.on(GetObjectCommand).rejects(new Error("S3 is down"));
    const { hasFileOnPlex } = await freshModule();
    expect(await hasFileOnPlex(1)).toBe(false);
  });
});

describe("matchingMovies", () => {
  it("breaks popularity ties by id, so pages stay stable", async () => {
    const { matchingMovies } = await freshModule();
    const movie = { genreIds: [], castIds: [], releaseDate: null, popularity: 1, hasFile: true };
    const index = { generatedAt: "", movies: [{ ...movie, id: 3 }, { ...movie, id: 1 }, { ...movie, id: 2 }] };
    const matched = matchingMovies(index, { genreIds: [], cast: [], services: [] });
    expect(matched.map(({ id }) => id)).toEqual([1, 2, 3]);
  });
});
