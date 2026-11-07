import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  matches: vi.fn(),
  swipeHistory: vi.fn(),
  watchOptions: vi.fn(),
  startNewRound: vi.fn(),
}));

vi.mock("@movie-date/frontend/services/api", () => ({
  api: mocks,
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Something went wrong."),
}));

import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import History from "@movie-date/frontend/screens/History";
import type { HistoryEntry, Match, Movie } from "@movie-date/frontend/services/api";

function makeMovie(id: number, title: string): Movie {
  return {
    id,
    title,
    overview: `${title} overview`,
    releaseYear: 1995,
    runtime: 120,
    voteAverage: 7.5,
    posterUrl: `https://image.tmdb.org/t/p/w780/${id}.jpg`,
    backdropUrl: null,
    genres: [],
  };
}

function makeMatch(id: number, title: string): Match {
  return {
    id: `match-${id}`,
    roomId: "room-1",
    round: 2,
    matchedAt: "2026-01-15T12:00:00Z",
    movie: makeMovie(id, title),
  };
}

function makeEntry(id: number, title: string, direction: HistoryEntry["direction"]): HistoryEntry {
  return { movie: makeMovie(id, title), direction, round: 1, swipedAt: "2026-01-14T12:00:00Z" };
}

function Location(): JSX.Element {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
}

function renderScreen(entry = "/history") {
  return render(
    <MemoryRouter
      future={{ v7_startTransition: false, v7_relativeSplatPath: true }}
      initialEntries={[entry]}
    >
      <ToastProvider>
        <History />
        <Location />
      </ToastProvider>
    </MemoryRouter>,
  );
}

const matchesPanel = () => screen.getByRole("tabpanel", { name: "Matches" });

beforeEach(() => {
  vi.resetAllMocks();
  mocks.matches.mockResolvedValue({ matches: [makeMatch(1, "Heat")], nextToken: null });
  mocks.swipeHistory.mockResolvedValue({
    entries: [makeEntry(2, "Alien", "LIKE"), makeEntry(3, "Cats", "PASS")],
    nextToken: null,
  });
  mocks.watchOptions.mockResolvedValue([]);
});

describe("History tabs", () => {
  it("opens on Matches and switches to My Swipes", async () => {
    renderScreen();

    expect(screen.getByRole("tab", { name: "Matches" })).toHaveAttribute("aria-selected", "true");
    expect(await within(matchesPanel()).findByRole("button", { name: /Heat \(1995\)/ })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("tab", { name: "My Swipes" }));

    const panel = screen.getByRole("tabpanel", { name: "My Swipes" });
    expect(within(panel).getByText("Alien (1995)")).toBeInTheDocument();
    expect(within(panel).getByText("Liked")).toBeInTheDocument();
    expect(within(panel).getByText("Passed")).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel", { name: "Matches" })).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/history?tab=swipes");
  });

  it("opens the tab named in the URL", async () => {
    renderScreen("/history?tab=swipes");

    expect(screen.getByRole("tab", { name: "My Swipes" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Alien (1995)")).toBeInTheDocument();
  });

  it("moves between tabs with the arrow keys", async () => {
    renderScreen();
    await screen.findByRole("button", { name: /Heat/ });

    screen.getByRole("tab", { name: "Matches" }).focus();
    await userEvent.keyboard("{ArrowRight}");

    const swipesTab = screen.getByRole("tab", { name: "My Swipes" });
    expect(swipesTab).toHaveFocus();
    expect(swipesTab).toHaveAttribute("aria-selected", "true");
  });

  it("keeps loaded pages when switching away and back", async () => {
    renderScreen();
    await screen.findByRole("button", { name: /Heat/ });

    await userEvent.click(screen.getByRole("tab", { name: "My Swipes" }));
    await userEvent.click(screen.getByRole("tab", { name: "Matches" }));

    expect(screen.getByRole("button", { name: /Heat/ })).toBeInTheDocument();
    expect(mocks.matches).toHaveBeenCalledTimes(1);
  });
});

describe("Past matches", () => {
  it("opens details with Where to Watch and no round reset", async () => {
    mocks.watchOptions.mockResolvedValue([
      { serviceId: "netflix", serviceName: "Netflix", type: "subscription", link: "https://n.example/1", logoUrl: null },
    ]);
    renderScreen();

    await userEvent.click(await screen.findByRole("button", { name: /Heat/ }));

    const sheet = screen.getByRole("dialog", { name: "Heat details" });
    expect(within(sheet).getByRole("heading", { name: "Heat, 1995" })).toBeInTheDocument();
    expect(within(sheet).getByText("Heat overview")).toBeInTheDocument();
    expect(await within(sheet).findByRole("link", { name: /Watch Heat on Netflix/ })).toBeInTheDocument();
    expect(mocks.watchOptions).toHaveBeenCalledWith(1);
    expect(within(sheet).queryByRole("button", { name: "Back to Start" })).not.toBeInTheDocument();
    expect(screen.queryByText("Match Found")).not.toBeInTheDocument();
    expect(mocks.startNewRound).not.toHaveBeenCalled();
  });

  it("closes the details sheet", async () => {
    renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: /Heat/ }));

    await userEvent.click(screen.getByRole("button", { name: "Close" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("only asks for watch options once a match is opened", async () => {
    renderScreen();
    await screen.findByRole("button", { name: /Heat/ });

    expect(mocks.watchOptions).not.toHaveBeenCalled();
  });
});

describe("Paging", () => {
  it("appends the next page and hides the button at the end", async () => {
    mocks.matches
      .mockResolvedValueOnce({ matches: [makeMatch(1, "Heat")], nextToken: "page-2" })
      .mockResolvedValueOnce({ matches: [makeMatch(2, "Alien")], nextToken: null });
    renderScreen();

    await userEvent.click(await within(matchesPanel()).findByRole("button", { name: "Load more" }));

    expect(await within(matchesPanel()).findByRole("button", { name: /Alien/ })).toBeInTheDocument();
    expect(within(matchesPanel()).getByRole("button", { name: /Heat/ })).toBeInTheDocument();
    expect(mocks.matches).toHaveBeenLastCalledWith({ limit: 20, nextToken: "page-2" });
    expect(within(matchesPanel()).queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("pages swipes with their own token", async () => {
    mocks.swipeHistory
      .mockResolvedValueOnce({ entries: [makeEntry(2, "Alien", "LIKE")], nextToken: "swipes-2" })
      .mockResolvedValueOnce({ entries: [makeEntry(3, "Cats", "PASS")], nextToken: null });
    renderScreen("/history?tab=swipes");

    await userEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Cats (1995)")).toBeInTheDocument();
    expect(mocks.swipeHistory).toHaveBeenLastCalledWith({ limit: 20, nextToken: "swipes-2" });
  });

  it("keeps the list and the button when a later page fails", async () => {
    mocks.matches
      .mockResolvedValueOnce({ matches: [makeMatch(1, "Heat")], nextToken: "page-2" })
      .mockRejectedValueOnce(new Error("Network down"));
    renderScreen();

    await userEvent.click(await within(matchesPanel()).findByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Network down")).toBeInTheDocument();
    expect(within(matchesPanel()).getByRole("button", { name: /Heat/ })).toBeInTheDocument();
    expect(within(matchesPanel()).getByRole("button", { name: "Load more" })).toBeEnabled();
  });
});

describe("Loading, empty and error states", () => {
  it("shows a skeleton while loading", () => {
    mocks.matches.mockReturnValue(new Promise(() => undefined));
    mocks.swipeHistory.mockReturnValue(new Promise(() => undefined));
    renderScreen();

    expect(within(matchesPanel()).getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("explains an empty Matches tab and leads back to the deck", async () => {
    mocks.matches.mockResolvedValue({ matches: [], nextToken: null });
    renderScreen();

    expect(await within(matchesPanel()).findByRole("heading", { name: "No matches yet" })).toBeInTheDocument();
    await userEvent.click(within(matchesPanel()).getByRole("button", { name: "Start swiping" }));

    expect(screen.getByTestId("location")).toHaveTextContent(/^\/$/);
  });

  it("explains an empty My Swipes tab", async () => {
    mocks.swipeHistory.mockResolvedValue({ entries: [], nextToken: null });
    renderScreen("/history?tab=swipes");

    expect(await screen.findByRole("heading", { name: "No swipes yet" })).toBeInTheDocument();
  });

  it("retries a failed first page", async () => {
    mocks.matches
      .mockRejectedValueOnce(new Error("Network down"))
      .mockResolvedValueOnce({ matches: [makeMatch(1, "Heat")], nextToken: null });
    renderScreen();

    expect(await within(matchesPanel()).findByRole("alert")).toHaveTextContent("Network down");
    await userEvent.click(within(matchesPanel()).getByRole("button", { name: "Try again" }));

    expect(await within(matchesPanel()).findByRole("button", { name: /Heat/ })).toBeInTheDocument();
  });
});
