import type { Filters } from "@movie-date/core";
import { filterPreview } from "@movie-date/functions/handlers/filterPreview";
import { ValidationError } from "@movie-date/functions/lib/errors";
import { loadLibraryIndex, type LibraryMovie } from "@movie-date/functions/lib/plexIndex";
import { discoverMovies, hydrateMovies, type DiscoverPage } from "@movie-date/functions/lib/tmdb";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { movieNamed, roomOf, user } from "../support/roomFixture";

vi.mock("@movie-date/functions/lib/events");
vi.mock("@movie-date/functions/lib/tmdb");
vi.mock("@movie-date/functions/lib/plexIndex", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/functions/lib/plexIndex")>()),
  loadLibraryIndex: vi.fn(),
}));

const ANA = user("ana");

let dynamo: FakeDynamo;

function libraryMovie(id: number, overrides: Partial<LibraryMovie> = {}): LibraryMovie {
  return {
    id,
    genreIds: [18],
    castIds: [287],
    releaseDate: "2020-06-01",
    popularity: 1000 - id,
    hasFile: true,
    ...overrides,
  };
}

function discoverPage(ids: number[], totalResults: number | null): DiscoverPage {
  return {
    totalPages: 1,
    totalResults,
    results: ids.map((id) => ({ id, originalLanguage: "en", hasPoster: true })),
  };
}

function filtersWith(overrides: Partial<Filters>): Filters {
  return { genreIds: [], cast: [], services: [], ...overrides };
}

function posterFor(id: number): string {
  return `https://img/${id}.jpg`;
}

async function givenLinkedRoom(): Promise<void> {
  await roomOf("ana", "ben");
  const profile = dynamo.row("USER#sub-ana", "PROFILE");
  if (!profile) throw new Error("No profile");
  dynamo.seed({ ...profile, plexUserId: "plex-ana", plexEmail: "ana@example.com" });
}

beforeEach(() => {
  dynamo = new FakeDynamo();
  vi.mocked(hydrateMovies).mockImplementation(async (ids) =>
    ids.map((id) => ({ ...movieNamed(id), posterUrl: posterFor(id) })),
  );
  vi.mocked(discoverMovies).mockResolvedValue(discoverPage([], 0));
  vi.mocked(loadLibraryIndex).mockResolvedValue({
    generatedAt: "2026-03-01T00:00:00.000Z",
    movies: [],
  });
});

afterEach(() => {
  dynamo.restore();
  vi.resetAllMocks();
});

describe("filterPreview", () => {
  it("gives TMDB's count and the first posters for the draft, not the saved filters", async () => {
    await roomOf("ana", "ben");
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1, 2, 3, 4, 5, 6, 7], 1234));
    const filters = filtersWith({ genreIds: [18] });

    const preview = await filterPreview({ filters }, ANA);

    expect(preview).toEqual({ totalResults: 1234, posterUrls: [1, 2, 3, 4, 5].map(posterFor) });
    expect(discoverMovies).toHaveBeenCalledWith(filters, 1);
  });

  it("skips a title with no poster and still fills the strip", async () => {
    await roomOf("ana", "ben");
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1, 2, 3, 4, 5, 6], 6));
    vi.mocked(hydrateMovies).mockImplementation(async (ids) =>
      ids.map((id) => ({ ...movieNamed(id), posterUrl: id === 1 ? null : posterFor(id) })),
    );

    const { posterUrls } = await filterPreview({ filters: filtersWith({}) }, ANA);

    expect(posterUrls).toEqual([2, 3, 4, 5, 6].map(posterFor));
  });

  it("says so when TMDB gives no count", async () => {
    await roomOf("ana", "ben");
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1], null));

    const { totalResults } = await filterPreview({ filters: filtersWith({}) }, ANA);

    expect(totalResults).toBeNull();
  });

  it("counts only the matching library titles with a file for Plex alone", async () => {
    await givenLinkedRoom();
    vi.mocked(loadLibraryIndex).mockResolvedValue({
      generatedAt: "2026-03-01T00:00:00.000Z",
      movies: [
        libraryMovie(1),
        libraryMovie(2, { hasFile: false }),
        libraryMovie(3, { genreIds: [35] }),
        libraryMovie(4),
      ],
    });

    const preview = await filterPreview(
      { filters: filtersWith({ services: ["plex"], genreIds: [18] }) },
      ANA,
    );

    expect(preview).toEqual({ totalResults: 2, posterUrls: [1, 4].map(posterFor) });
    expect(discoverMovies).not.toHaveBeenCalled();
  });

  it("adds the library to TMDB's count and mixes the posters for Plex with a service", async () => {
    await givenLinkedRoom();
    vi.mocked(loadLibraryIndex).mockResolvedValue({
      generatedAt: "2026-03-01T00:00:00.000Z",
      movies: [libraryMovie(1), libraryMovie(2)],
    });
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([2, 101], 40));

    const preview = await filterPreview(
      { filters: filtersWith({ services: ["plex", "netflix"] }) },
      ANA,
    );

    expect(preview).toEqual({ totalResults: 42, posterUrls: [1, 101, 2].map(posterFor) });
  });

  it("ignores the plex key for a room with nobody linked, as the deck does", async () => {
    await roomOf("ana", "ben");
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1], 9));

    const { totalResults } = await filterPreview(
      { filters: filtersWith({ services: ["plex"] }) },
      ANA,
    );

    expect(totalResults).toBe(9);
    expect(loadLibraryIndex).not.toHaveBeenCalled();
  });

  it("answers for someone who has no room yet", async () => {
    vi.mocked(discoverMovies).mockResolvedValue(discoverPage([1], 9));

    const { totalResults } = await filterPreview(
      { filters: filtersWith({ services: ["plex"] }) },
      ANA,
    );

    expect(totalResults).toBe(9);
  });

  it("refuses filters updateFilters would refuse", async () => {
    await expect(
      filterPreview({ filters: filtersWith({ releaseDateGte: "soon" }) }, ANA),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(discoverMovies).not.toHaveBeenCalled();
  });
});
