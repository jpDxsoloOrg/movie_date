import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMatch: vi.fn(),
  watchOptions: vi.fn(),
  startNewRound: vi.fn(),
  setRoom: vi.fn(),
}));

vi.mock("@movie-date/frontend/services/api", () => ({
  api: { findMatch: mocks.findMatch, watchOptions: mocks.watchOptions, startNewRound: mocks.startNewRound },
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Something went wrong."),
}));
vi.mock("@movie-date/frontend/services/realtime", () => ({ subscribeToRoom: vi.fn() }));

import { RoomContext, type RoomContextValue } from "@movie-date/frontend/context/RoomProvider";
import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import MatchFound from "@movie-date/frontend/screens/MatchFound";
import type { Match, Room, WatchOption } from "@movie-date/frontend/services/api";

const room: Room = {
  id: "room-1",
  code: "ABC234",
  matchThreshold: 2,
  requireMajority: false,
  round: 3,
  filters: { genreIds: [], services: [], cast: [], releaseDateGte: null, releaseDateLte: null },
  members: [],
};

function makeMatch(overrides: Partial<Match> = {}): Match {
  return {
    id: "match-1",
    roomId: "room-1",
    round: 3,
    matchedAt: "2026-01-15T12:00:00Z",
    movie: {
      id: 949,
      title: "Heat",
      overview: "A crew of thieves and the detective hunting them.",
      releaseYear: 1995,
      runtime: 170,
      voteAverage: 7.94,
      posterUrl: "https://image.tmdb.org/t/p/w780/heat.jpg",
      backdropUrl: null,
      genres: ["Crime"],
    },
    ...overrides,
  };
}

function option(overrides: Partial<WatchOption> = {}): WatchOption {
  return {
    serviceId: "netflix",
    serviceName: "Netflix",
    type: "subscription",
    link: "https://www.netflix.com/title/1",
    logoUrl: null,
    ...overrides,
  };
}

function Path(): JSX.Element {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderScreen(routerState?: { match?: Match }, currentRoom: Room = room) {
  const context = { room: currentRoom, setRoom: mocks.setRoom } as unknown as RoomContextValue;
  return render(
    <MemoryRouter
      future={{ v7_startTransition: false, v7_relativeSplatPath: true }}
      initialEntries={[{ pathname: "/match/match-1", state: routerState }]}
    >
      <ToastProvider>
        <RoomContext.Provider value={context}>
          <Routes>
            <Route path="/match/:matchId" element={<MatchFound />} />
            <Route path="*" element={null} />
          </Routes>
          <Path />
        </RoomContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.watchOptions.mockResolvedValue([option()]);
});

describe("MatchFound", () => {
  it("shows the match from router state without looking it up", async () => {
    renderScreen({ match: makeMatch() });

    expect(screen.getByRole("heading", { name: "Match Found" })).toBeInTheDocument();
    expect(screen.getByText("Your Movie Tonight!")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Heat, 1995" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Heat poster" })).toBeInTheDocument();
    expect(screen.getByText("170 min")).toBeInTheDocument();
    expect(screen.getByText("7.9/10")).toBeInTheDocument();
    expect(screen.getByText(/crew of thieves/)).toBeInTheDocument();
    await screen.findByRole("link", { name: /Netflix/ });
    expect(mocks.findMatch).not.toHaveBeenCalled();
  });

  it("looks the match up on a reload, showing a skeleton meanwhile", async () => {
    mocks.findMatch.mockResolvedValue(makeMatch());
    renderScreen();

    expect(screen.getByRole("status", { name: "Loading your match" })).toBeInTheDocument();
    expect(await screen.findByRole("heading", { name: "Heat, 1995" })).toBeInTheDocument();
    expect(mocks.findMatch).toHaveBeenCalledWith("match-1");
  });

  it("ignores router state belonging to a different match", async () => {
    mocks.findMatch.mockResolvedValue(makeMatch());
    renderScreen({ match: makeMatch({ id: "other" }) });

    await screen.findByRole("heading", { name: "Heat, 1995" });
    expect(mocks.findMatch).toHaveBeenCalledWith("match-1");
  });

  it("offers a way home when the match isn't in this room", async () => {
    mocks.findMatch.mockResolvedValue(null);
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Match not found" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Back to Start" }));

    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
    expect(mocks.startNewRound).not.toHaveBeenCalled();
  });

  it("retries after a failed lookup", async () => {
    mocks.findMatch.mockRejectedValueOnce(new Error("Network down")).mockResolvedValueOnce(makeMatch());
    renderScreen();

    expect(await screen.findByRole("alert")).toHaveTextContent("Network down");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(await screen.findByRole("heading", { name: "Heat, 1995" })).toBeInTheDocument();
  });

  it("copes with a movie missing its optional details", async () => {
    const match = makeMatch();
    match.movie = { ...match.movie, releaseYear: null, runtime: null, voteAverage: 0, posterUrl: null };
    renderScreen({ match });

    expect(screen.getByRole("heading", { name: "Heat" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Heat poster" })).toBeInTheDocument();
    expect(screen.queryByText(/min$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/\/10$/)).not.toBeInTheDocument();
    await screen.findByRole("link", { name: /Netflix/ });
  });

  describe("Back to Start", () => {
    it("starts a round from the match's round, applies the room and goes home", async () => {
      const nextRoom = { ...room, round: 4 };
      mocks.startNewRound.mockResolvedValue(nextRoom);
      renderScreen({ match: makeMatch({ round: 2 }) });

      await userEvent.click(screen.getByRole("button", { name: "Back to Start" }));

      await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/));
      expect(mocks.startNewRound).toHaveBeenCalledWith(2);
      expect(mocks.setRoom).toHaveBeenCalledWith(nextRoom);
    });

    it("stays put and allows another try when it fails", async () => {
      mocks.startNewRound.mockRejectedValue(new Error("Could not reach the server"));
      renderScreen({ match: makeMatch() });

      await userEvent.click(screen.getByRole("button", { name: "Back to Start" }));

      expect(await screen.findByText("Could not reach the server")).toBeInTheDocument();
      expect(screen.getByTestId("path")).toHaveTextContent("/match/match-1");
      expect(screen.getByRole("button", { name: "Back to Start" })).toBeEnabled();
    });

    it("never resets a room the match doesn't belong to", async () => {
      renderScreen({ match: makeMatch({ roomId: "old-room" }) });

      await userEvent.click(screen.getByRole("button", { name: "Back to Start" }));

      await waitFor(() => expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/));
      expect(mocks.startNewRound).not.toHaveBeenCalled();
    });
  });

  describe("Where to Watch", () => {
    it("links out in a new tab using the bundled logo, without JustWatch credit for deep links", async () => {
      renderScreen({ match: makeMatch() });

      const link = await screen.findByRole("link", { name: /Watch Heat on Netflix/ });
      expect(link).toHaveAttribute("href", "https://www.netflix.com/title/1");
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
      expect(within(link).getByText("Subscription")).toBeInTheDocument();
      expect(link.querySelector("img")).toHaveAttribute("src", "/icons/netflix.png");
      expect(screen.queryByText(/JustWatch/)).not.toBeInTheDocument();
    });

    it("shows a service without a link as a plain tile", async () => {
      mocks.watchOptions.mockResolvedValue([option({ link: null })]);
      renderScreen({ match: makeMatch() });

      expect(await screen.findByRole("img", { name: "Netflix" })).toBeInTheDocument();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("refuses a link that isn't http or https", async () => {
      mocks.watchOptions.mockResolvedValue([option({ link: "javascript:alert(1)" })]);
      renderScreen({ match: makeMatch() });

      await screen.findByRole("img", { name: "Netflix" });
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });

    it("uses the provider logo for an unknown service, then its name if that fails", async () => {
      mocks.watchOptions.mockResolvedValue([
        option({ serviceId: "mubi", serviceName: "MUBI", logoUrl: "https://cdn.example.com/mubi.png" }),
      ]);
      renderScreen({ match: makeMatch() });

      const logo = await screen.findByRole("img", { name: "MUBI" });
      expect(logo).toHaveAttribute("src", "https://cdn.example.com/mubi.png");

      fireEvent.error(logo);

      expect(screen.queryByRole("img", { name: "MUBI" })).not.toBeInTheDocument();
      expect(screen.getByText("MUBI")).toBeInTheDocument();
    });

    it("falls back to the name when an unknown service has no logo", async () => {
      mocks.watchOptions.mockResolvedValue([option({ serviceId: "mubi", serviceName: "MUBI" })]);
      renderScreen({ match: makeMatch() });

      expect(await screen.findByText("MUBI")).toBeInTheDocument();
    });

    it("credits JustWatch when options came from the TMDB fallback", async () => {
      mocks.watchOptions.mockResolvedValue([
        option({ link: "https://www.themoviedb.org/movie/949/watch?locale=US" }),
      ]);
      renderScreen({ match: makeMatch() });

      expect(await screen.findByRole("link", { name: "JustWatch" })).toHaveAttribute(
        "href",
        "https://www.justwatch.com",
      );
    });

    it("credits JustWatch for a fallback region with no watch page", async () => {
      mocks.watchOptions.mockResolvedValue([
        option({ link: null, logoUrl: "https://image.tmdb.org/t/p/w92/logo.png" }),
      ]);
      renderScreen({ match: makeMatch() });

      expect(await screen.findByRole("link", { name: "JustWatch" })).toBeInTheDocument();
    });

    it("says so when nothing is streaming it", async () => {
      mocks.watchOptions.mockResolvedValue([]);
      renderScreen({ match: makeMatch() });

      expect(await screen.findByRole("heading", { name: "Not streaming right now" })).toBeInTheDocument();
    });

    it("shows a skeleton, then lets a failure retry without losing the match", async () => {
      mocks.watchOptions.mockRejectedValueOnce(new Error("Upstream failed")).mockResolvedValueOnce([option()]);
      renderScreen({ match: makeMatch() });

      expect(screen.getByRole("status", { name: "Loading streaming options" })).toBeInTheDocument();
      expect(await screen.findByRole("alert")).toHaveTextContent("Upstream failed");
      expect(screen.getByRole("heading", { name: "Heat, 1995" })).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "Try again" }));

      expect(await screen.findByRole("link", { name: /Netflix/ })).toBeInTheDocument();
    });
  });
});
