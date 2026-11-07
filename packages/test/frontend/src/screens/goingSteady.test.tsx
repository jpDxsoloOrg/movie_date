import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deck: vi.fn(),
  swipe: vi.fn(),
  undoSwipe: vi.fn(),
  trailer: vi.fn(),
  watchOptions: vi.fn(),
  plexStatus: vi.fn(),
  requestOnPlex: vi.fn(),
  matches: vi.fn(),
  swipeHistory: vi.fn(),
  genres: vi.fn(),
  filterPreview: vi.fn(),
  updateFilters: vi.fn(),
  searchPeople: vi.fn(),
  startNewRound: vi.fn(),
  findMatch: vi.fn(),
}));

vi.mock("@movie-date/frontend/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/frontend/services/api")>()),
  api: mocks,
}));
vi.mock("qrcode", () => ({ toDataURL: vi.fn(async () => "data:image/png;base64,AAAA") }));

import { RoomContext } from "@movie-date/frontend/context/RoomProvider";
import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import { ModeContext, modeValue } from "../../../../frontend/src/mode/ModeProvider";
import { MODE_COPY } from "../../../../frontend/src/mode/modeCopy";
import Filters from "@movie-date/frontend/screens/Filters";
import History from "@movie-date/frontend/screens/History";
import Home from "@movie-date/frontend/screens/Home";
import MatchFound from "@movie-date/frontend/screens/MatchFound";
import type { DeckCard, Match, MediaType, PlexStatus, Room, Show } from "@movie-date/frontend/services/api";
import { fakeRoomContext, makeProfile, makeRoom } from "../support/roomHarness";
import { fakeViewport } from "../support/viewport";

function makeShow(id: number, overrides: Partial<Show> = {}): Show {
  return {
    id,
    title: `Show ${id}`,
    overview: `Overview ${id}`,
    firstAirYear: 2019,
    lastAirYear: 2023,
    status: "Ended",
    seasonCount: 4,
    episodeCount: 40,
    networks: ["HBO"],
    episodeRuntime: 55,
    voteAverage: 8.4,
    posterUrl: `https://img.test/${id}.jpg`,
    backdropUrl: null,
    genres: ["Drama"],
    ...overrides,
  };
}

function asMovie(show: Show): DeckCard["movie"] {
  return {
    id: show.id,
    title: show.title,
    overview: show.overview,
    releaseYear: show.firstAirYear,
    runtime: show.episodeRuntime,
    voteAverage: show.voteAverage,
    posterUrl: show.posterUrl,
    backdropUrl: show.backdropUrl,
    genres: show.genres,
  };
}

function makeCard(id: number): DeckCard {
  const show = makeShow(id);
  return { likedByRoommate: false, mediaType: "TV", show, movie: asMovie(show) };
}

function makeMatch(id: number): Match {
  const show = makeShow(id);
  return {
    id: `match-${id}`,
    roomId: "room-1",
    round: 3,
    matchedAt: "2026-01-15T12:00:00Z",
    mediaType: "TV",
    show,
    movie: asMovie(show),
  };
}

function Path(): JSX.Element {
  const { pathname, search } = useLocation();
  return <div data-testid="path">{`${pathname}${search}`}</div>;
}

interface Setup {
  mode?: MediaType;
  path: string;
  routePath?: string;
  room?: Room;
  plexLinked?: boolean;
  state?: unknown;
  children: ReactNode;
}

function renderIn({ mode = "TV", path, routePath, room, plexLinked = false, state, children }: Setup) {
  const context = fakeRoomContext({ me: makeProfile({ plexLinked }), room: room ?? makeRoom() });
  render(
    <MemoryRouter
      future={{ v7_startTransition: false, v7_relativeSplatPath: true }}
      initialEntries={[{ pathname: path.split("?")[0], search: path.split("?")[1] ? `?${path.split("?")[1]}` : "", state }]}
    >
      <ToastProvider>
        <ModeContext.Provider value={modeValue(mode)}>
          <RoomContext.Provider value={context}>
            <Routes>
              <Route path={routePath ?? path.split("?")[0]} element={children} />
              <Route path="*" element={<p>Elsewhere</p>} />
            </Routes>
            <Path />
          </RoomContext.Provider>
        </ModeContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  );
  return context;
}

let viewport: ReturnType<typeof fakeViewport>;

beforeEach(() => {
  viewport = fakeViewport(390);
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.trailer.mockResolvedValue(null);
  mocks.watchOptions.mockResolvedValue([]);
  mocks.plexStatus.mockResolvedValue(null);
  mocks.matches.mockResolvedValue({ matches: [], nextToken: null });
  mocks.swipeHistory.mockResolvedValue({ entries: [], nextToken: null });
  mocks.genres.mockResolvedValue([{ id: 10765, name: "Sci-Fi & Fantasy" }]);
  mocks.filterPreview.mockResolvedValue({ totalResults: 120, posterUrls: [] });
  mocks.swipe.mockResolvedValue({ movieId: 1, mediaType: "TV", direction: "LIKE", match: null });
});

afterEach(() => viewport.restore());

describe("the show deck", () => {
  beforeEach(() => mocks.deck.mockResolvedValue({ cards: [makeCard(1), makeCard(2)], nextPage: null }));

  it("asks for shows and prints the show's line, then network and rating", async () => {
    renderIn({ path: "/shows", children: <Home /> });
    const card = await screen.findByRole("article", { name: "Show 1" });
    expect(mocks.deck).toHaveBeenCalledWith(1, "TV");
    expect(within(card).getByText("2019–2023 · 4 seasons · Ended")).toBeInTheDocument();
    expect(within(card).getByText("HBO · 8.4/10")).toBeInTheDocument();
    expect(within(card).getByRole("heading", { name: "Show 1" })).toBeInTheDocument();
  });

  it("swipes as Go Steady and Just Friends, sending the mode", async () => {
    const user = userEvent.setup();
    renderIn({ path: "/shows", children: <Home /> });
    await screen.findByRole("article", { name: "Show 1" });
    await user.click(screen.getByRole("button", { name: "Go Steady" }));
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalledWith(1, "LIKE", "TV"));
    await user.click(screen.getByRole("button", { name: "Just Friends" }));
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalledWith(2, "PASS", "TV"));
  });

  it("undoes with the mode, so a TV id can't undo the movie with the same number", async () => {
    const user = userEvent.setup();
    mocks.undoSwipe.mockResolvedValue({ movieId: 1, mediaType: "TV", undone: true });
    renderIn({ path: "/shows", room: makeRoom({ id: "room-undo" }), children: <Home /> });
    await screen.findByRole("article", { name: "Show 1" });
    await user.click(screen.getByRole("button", { name: "Go Steady" }));
    await user.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(mocks.undoSwipe).toHaveBeenCalledWith(1, "TV"));
  });

  it("offers filters on the show side when the deck runs out", async () => {
    const user = userEvent.setup();
    mocks.deck.mockResolvedValue({ cards: [], nextPage: null });
    renderIn({ path: "/shows", room: makeRoom({ id: "room-empty" }), children: <Home /> });
    expect(await screen.findByText("No more shows")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Change Filters" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/shows/filters");
  });
});

describe("a deck that keeps finding nothing", () => {
  const emptyWalk = (page: number) => ({ cards: [], nextPage: page + 1 });

  it("stops asking after three empty walks, and goes on only when told to", async () => {
    const user = userEvent.setup();
    mocks.deck.mockImplementation(async (page: number) => emptyWalk(page));
    renderIn({ path: "/shows", room: makeRoom({ id: "room-walk" }), children: <Home /> });

    expect(await screen.findByText("Nothing yet")).toBeInTheDocument();
    expect(mocks.deck).toHaveBeenCalledTimes(3);

    await user.click(screen.getByRole("button", { name: "Search further" }));
    await waitFor(() => expect(mocks.deck).toHaveBeenCalledTimes(6));
    expect(await screen.findByText("Nothing yet")).toBeInTheDocument();
  });

  it("starts the count again after a page with cards", async () => {
    mocks.deck.mockImplementation(async (page: number) =>
      page === 3 ? { cards: [makeCard(1)], nextPage: 4 } : emptyWalk(page),
    );
    renderIn({ path: "/shows", room: makeRoom({ id: "room-walk-2" }), children: <Home /> });

    await screen.findByRole("article", { name: "Show 1" });
    await waitFor(() => expect(mocks.deck).toHaveBeenCalledTimes(6));
    expect(screen.getByRole("article", { name: "Show 1" })).toBeInTheDocument();
  });

  it("still ends the deck when there are no more pages", async () => {
    mocks.deck.mockImplementation(async (page: number) => ({ cards: [], nextPage: page < 3 ? page + 1 : null }));
    renderIn({ path: "/shows", room: makeRoom({ id: "room-walk-3" }), children: <Home /> });
    expect(await screen.findByText("No more shows")).toBeInTheDocument();
  });
});

describe("the words and pictures in Going Steady", () => {
  it("draws a TV, not a clapperboard, for a show with no poster", async () => {
    const card = makeCard(1);
    card.movie.posterUrl = null;
    mocks.deck.mockResolvedValue({ cards: [card], nextPage: null });
    renderIn({ path: "/shows", room: makeRoom({ id: "room-art" }), children: <Home /> });
    const shown = await screen.findByRole("article", { name: "Show 1" });
    const path = shown.querySelector(".deck-card__poster--missing path");
    expect(path?.getAttribute("d")).toMatch(/^M21 3H3/);
  });
});

describe("Plex on a show", () => {
  async function openDetails(status: PlexStatus): Promise<void> {
    mocks.deck.mockResolvedValue({ cards: [makeCard(1)], nextPage: null });
    mocks.plexStatus.mockResolvedValue(status);
    const user = userEvent.setup();
    renderIn({ path: "/shows", room: makeRoom({ id: `room-plex-${status.availability}` }), plexLinked: true, children: <Home /> });
    await user.click(await screen.findByRole("button", { name: "Details for Show 1" }));
    await waitFor(() => expect(mocks.plexStatus).toHaveBeenCalledWith(1, "TV"));
  }

  it("shows the partial state from AVAILABLE with missing seasons", async () => {
    await openDetails({ availability: "AVAILABLE", canRequest: false, missingSeasons: [4, 3] });
    expect(await screen.findByText("Partly on Plex")).toBeInTheDocument();
    expect(screen.getByText("Seasons 3 and 4 are missing from the library.")).toBeInTheDocument();
  });

  it("names a single missing season", async () => {
    await openDetails({ availability: "AVAILABLE", canRequest: false, missingSeasons: [2] });
    expect(await screen.findByText("Season 2 is missing from the library.")).toBeInTheDocument();
  });

  it("reads plainly as On Plex with nothing missing", async () => {
    await openDetails({ availability: "AVAILABLE", canRequest: false, missingSeasons: [] });
    expect(await screen.findByText("On Plex")).toBeInTheDocument();
    expect(screen.queryByText("Partly on Plex")).not.toBeInTheDocument();
  });

  it("doesn't promise an available show is ready, since the index can't see its files", async () => {
    await openDetails({ availability: "AVAILABLE", canRequest: false });
    expect(await screen.findByText("It's in the library.")).toBeInTheDocument();
    expect(screen.queryByText(/Ready to watch/)).not.toBeInTheDocument();
  });

  it("never offers a request, even if the API says it can", async () => {
    await openDetails({ availability: "NOT_IN_LIBRARY", canRequest: true, missingSeasons: null });
    expect(await screen.findByText("Not on Plex")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Request on Plex" })).not.toBeInTheDocument();
  });

  it("doesn't call a show that simply isn't there an outage", async () => {
    await openDetails({ availability: "NOT_IN_LIBRARY", canRequest: false, missingSeasons: null });
    expect(await screen.findByText("It isn't in the library yet.")).toBeInTheDocument();
    expect(screen.queryByText("Plex requests are unavailable right now.")).not.toBeInTheDocument();
  });
});

describe("the show match screen", () => {
  function renderMatch(match = makeMatch(1)) {
    return renderIn({
      path: `/shows/match/${match.id}`,
      routePath: "/shows/match/:matchId",
      state: { match },
      room: makeRoom({ tvRound: 3 }),
      children: <MatchFound />,
    });
  }

  it("announces it with the Going Steady words and the show's facts", async () => {
    renderMatch();
    expect(await screen.findByRole("heading", { name: "It's Official" })).toBeInTheDocument();
    expect(screen.getByText("Your Next Show!")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Show 1, 2019–2023" })).toBeInTheDocument();
    expect(screen.getByText("4 seasons")).toBeInTheDocument();
    expect(screen.getByText("Ended")).toBeInTheDocument();
    expect(screen.getByText("HBO")).toBeInTheDocument();
    expect(mocks.watchOptions).toHaveBeenCalledWith(1, "TV");
  });

  it("Keep Looking starts the show round and stays on the show side", async () => {
    const user = userEvent.setup();
    const next = makeRoom({ tvRound: 4 });
    mocks.startNewRound.mockResolvedValue(next);
    const context = renderMatch();
    await user.click(screen.getByRole("button", { name: "Keep Looking" }));
    await waitFor(() => expect(mocks.startNewRound).toHaveBeenCalledWith(3, "TV"));
    expect(context.setRoom).toHaveBeenCalledWith(next);
    expect(screen.getByTestId("path")).toHaveTextContent("/shows");
  });

  it("looks a reloaded match up on the show side", async () => {
    mocks.findMatch.mockResolvedValue(makeMatch(1));
    renderIn({ path: "/shows/match/match-1", routePath: "/shows/match/:matchId", children: <MatchFound /> });
    expect(await screen.findByRole("heading", { name: "It's Official" })).toBeInTheDocument();
    expect(mocks.findMatch).toHaveBeenCalledWith("match-1", "TV");
  });
});

describe("History's Movies / Shows toggle", () => {
  it("opens on the mode the person is in", async () => {
    renderIn({ path: "/history", children: <History /> });
    expect(screen.getByRole("radio", { name: "Shows" })).toBeChecked();
    await waitFor(() => expect(mocks.matches).toHaveBeenCalledWith({ limit: 20, nextToken: null }, "TV"));
    expect(mocks.swipeHistory).toHaveBeenCalledWith({ limit: 20, nextToken: null }, "TV");
  });

  it("switches both lists and keeps the tab", async () => {
    const user = userEvent.setup();
    renderIn({ mode: "MOVIE", path: "/history?tab=swipes", children: <History /> });
    await waitFor(() => expect(mocks.swipeHistory).toHaveBeenCalledWith({ limit: 20, nextToken: null }, "MOVIE"));
    await user.click(screen.getByRole("radio", { name: "Shows" }));
    await waitFor(() => expect(mocks.swipeHistory).toHaveBeenCalledWith({ limit: 20, nextToken: null }, "TV"));
    expect(mocks.matches).toHaveBeenCalledWith({ limit: 20, nextToken: null }, "TV");
    expect(screen.getByTestId("path")).toHaveTextContent("tab=swipes");
    expect(screen.getByTestId("path")).toHaveTextContent("media=shows");
    expect(screen.getByRole("tab", { name: "My Swipes" })).toHaveAttribute("aria-selected", "true");
  });

  it("keeps the toggle when the tab changes", async () => {
    const user = userEvent.setup();
    renderIn({ mode: "MOVIE", path: "/history?media=shows", children: <History /> });
    await user.click(screen.getByRole("tab", { name: "My Swipes" }));
    expect(screen.getByTestId("path")).toHaveTextContent("media=shows");
    expect(screen.getByRole("radio", { name: "Shows" })).toBeChecked();
  });

  it("prints a past show with its years and reads a swipe in the show's words", async () => {
    const match = makeMatch(1);
    mocks.matches.mockResolvedValue({ matches: [match], nextToken: null });
    mocks.swipeHistory.mockResolvedValue({
      entries: [
        { mediaType: "TV", movie: match.movie, show: match.show, direction: "LIKE", round: 1, swipedAt: match.matchedAt },
      ],
      nextToken: null,
    });
    renderIn({ path: "/history?tab=swipes", children: <History /> });
    expect(await screen.findByText("Go Steady")).toBeInTheDocument();
    expect(screen.getByText("Show 1")).toBeInTheDocument();
    expect(screen.getByText("2019–2023")).toBeInTheDocument();
  });

  it("uses the show wording when there's nothing yet", async () => {
    renderIn({ path: "/history", children: <History /> });
    expect(await screen.findByText(MODE_COPY.TV.noMatchesMessage)).toBeInTheDocument();
  });
});

describe("show filters", () => {
  function renderFilters(room = makeRoom({ id: `room-filters-${Math.random()}` })) {
    return renderIn({ path: "/shows/filters", room, children: <Filters /> });
  }

  beforeEach(() => mocks.updateFilters.mockImplementation(async () => makeRoom()));

  it("loads TV genres and offers the show fields", async () => {
    renderFilters();
    expect(await screen.findByRole("button", { name: "Sci-Fi & Fantasy" })).toBeInTheDocument();
    expect(mocks.genres).toHaveBeenCalledWith("TV");
    expect(screen.getByRole("heading", { name: "First Air Date" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Release Date" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Still Running" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Finished" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Short and Sweet, 1–2 seasons" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "A Few Seasons, 3–5 seasons" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Long Haul, 6+ seasons" })).toBeInTheDocument();
  });

  it("saves to the show side with no default date, and goes back to the show deck", async () => {
    const user = userEvent.setup();
    const context = renderFilters();
    await user.click(await screen.findByRole("button", { name: "Still Running" }));
    await user.click(screen.getByRole("button", { name: "Long Haul, 6+ seasons" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mocks.updateFilters).toHaveBeenCalled());
    const [saved, mediaType] = mocks.updateFilters.mock.calls[0] as [Record<string, unknown>, MediaType];
    expect(mediaType).toBe("TV");
    expect(saved).toMatchObject({ showStatus: "RUNNING", commitment: "LONG_HAUL" });
    expect(saved.releaseDateGte ?? null).toBeNull();
    expect(saved.firstAirDateGte ?? null).toBeNull();
    await waitFor(() => expect(context.setRoom).toHaveBeenCalled());
    expect(screen.getByTestId("path")).toHaveTextContent("/shows");
  });

  it("puts a picked decade in the first-air fields", async () => {
    const user = userEvent.setup();
    renderFilters();
    await user.click(await screen.findByRole("button", { name: "2010s" }));
    await user.click(screen.getByRole("button", { name: "Apply" }));
    await waitFor(() => expect(mocks.updateFilters).toHaveBeenCalled());
    expect(mocks.updateFilters.mock.calls[0]?.[0]).toMatchObject({
      firstAirDateGte: "2010-01-01",
      firstAirDateLte: "2019-12-31",
    });
  });

  it("presses a level off again and allows only one at a time", async () => {
    const user = userEvent.setup();
    renderFilters();
    const short = await screen.findByRole("button", { name: "Short and Sweet, 1–2 seasons" });
    const long = screen.getByRole("button", { name: "Long Haul, 6+ seasons" });
    await user.click(short);
    await user.click(long);
    expect(short).toHaveAttribute("aria-pressed", "false");
    expect(long).toHaveAttribute("aria-pressed", "true");
    await user.click(long);
    expect(long).toHaveAttribute("aria-pressed", "false");
  });

  it("reads the room's show filters, not its movie ones", async () => {
    const room = makeRoom({
      id: "room-filters-saved",
      filters: { genreIds: [], services: [], cast: [], releaseDateGte: "1990-01-01", releaseDateLte: "1999-12-31" },
      tvFilters: { genreIds: [10765], services: [], cast: [], showStatus: "FINISHED", commitment: "SHORT_AND_SWEET" },
    });
    renderFilters(room);
    expect(await screen.findByRole("button", { name: "Finished" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Sci-Fi & Fantasy" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "1990s" })).toHaveAttribute("aria-pressed", "false");
  });

  it("previews against the show deck in show words", async () => {
    renderFilters();
    await waitFor(() => expect(mocks.filterPreview).toHaveBeenCalled());
    expect(mocks.filterPreview.mock.calls[0]?.[1]).toBe("TV");
    expect(await screen.findByText("About 120 shows")).toBeInTheDocument();
  });
});

describe("the movie side is unchanged", () => {
  it("doesn't offer the show filters", async () => {
    renderIn({ mode: "MOVIE", path: "/filters", children: <Filters /> });
    expect(await screen.findByRole("heading", { name: "Release Date" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Still Running" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Commitment Level" })).not.toBeInTheDocument();
  });
});
