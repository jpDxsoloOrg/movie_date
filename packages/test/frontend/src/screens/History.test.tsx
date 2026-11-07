import { render, screen, within, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  clearHistory: vi.fn(),
  matches: vi.fn(),
  swipeHistory: vi.fn(),
  watchOptions: vi.fn(),
  startNewRound: vi.fn(),
  plexStatus: vi.fn(),
  requestOnPlex: vi.fn(),
}));

vi.mock("@movie-date/frontend/services/api", () => ({
  api: mocks,
  errorMessage: (error: unknown) => (error instanceof Error ? error.message : "Something went wrong."),
}));

import { RoomContext } from "@movie-date/frontend/context/RoomProvider";
import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import History from "@movie-date/frontend/screens/History";
import type { HistoryEntry, Match, Movie } from "@movie-date/frontend/services/api";
import { fakeRoomContext, makeProfile } from "../support/roomHarness";
import { fakeViewport } from "../support/viewport";

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
    mediaType: "MOVIE",
    cleared: false,
    movie: makeMovie(id, title),
    show: null,
  };
}

function makeEntry(id: number, title: string, direction: HistoryEntry["direction"]): HistoryEntry {
  return {
    mediaType: "MOVIE",
    movie: makeMovie(id, title),
    show: null,
    direction,
    round: 1,
    swipedAt: "2026-01-14T12:00:00Z",
  };
}

function Location(): JSX.Element {
  const { pathname, search } = useLocation();
  return <div data-testid="location">{`${pathname}${search}`}</div>;
}

function renderScreen(entry = "/history", plexLinked = false, container?: HTMLElement) {
  const context = fakeRoomContext({ me: makeProfile({ plexLinked }) });
  return render(
    <MemoryRouter
      future={{ v7_startTransition: false, v7_relativeSplatPath: true }}
      initialEntries={[entry]}
    >
      <ToastProvider>
        <RoomContext.Provider value={context}>
          <History />
          <Location />
        </RoomContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
    container ? { container } : undefined,
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
    expect(within(panel).getByText("Alien")).toBeInTheDocument();
    expect(within(panel).getAllByText("1995")).toHaveLength(2);
    expect(within(within(panel).getByRole("list", { name: "Your swipes" })).getByText("Liked")).toBeInTheDocument();
    expect(within(within(panel).getByRole("list", { name: "Your swipes" })).getByText("Passed")).toBeInTheDocument();
    expect(screen.queryByRole("tabpanel", { name: "Matches" })).not.toBeInTheDocument();
    expect(screen.getByTestId("location")).toHaveTextContent("/history?tab=swipes");
  });

  it("opens the tab named in the URL", async () => {
    renderScreen("/history?tab=swipes");

    expect(screen.getByRole("tab", { name: "My Swipes" })).toHaveAttribute("aria-selected", "true");
    expect(await screen.findByText("Alien")).toBeInTheDocument();
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

  it("opens the other tab at the top, since both share the page's scroller", async () => {
    const scroller = document.body.appendChild(document.createElement("main"));
    scroller.className = "md-page__content";
    renderScreen("/history", false, scroller);
    await screen.findByRole("button", { name: /Heat/ });

    scroller.scrollTop = 900;
    await userEvent.click(screen.getByRole("tab", { name: "My Swipes" }));
    expect(scroller.scrollTop).toBe(0);

    scroller.scrollTop = 900;
    await userEvent.click(screen.getByRole("tab", { name: "My Swipes" }));
    expect(scroller.scrollTop).toBe(900);
    scroller.remove();
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

describe("Filtering", () => {
  it("searches matches by title once typing settles, keeping focus in the field", async () => {
    renderScreen();
    await within(matchesPanel()).findByRole("button", { name: /Heat \(1995\)/ });
    mocks.matches.mockResolvedValue({ matches: [], nextToken: null });
    const field = within(matchesPanel()).getByLabelText("Search by title");
    await userEvent.type(field, "zzz");

    expect(await within(matchesPanel()).findByText("No matches found")).toBeInTheDocument();
    expect(mocks.matches).toHaveBeenLastCalledWith(expect.objectContaining({ search: "zzz" }), "MOVIE");
    expect(field).toHaveFocus();
    expect(within(matchesPanel()).queryByRole("button", { name: "Start swiping" })).not.toBeInTheDocument();
  });

  it("filters swipes by direction", async () => {
    renderScreen("/history?tab=swipes");
    const panel = screen.getByRole("tabpanel", { name: "My Swipes" });
    await within(panel).findByText("Alien");
    await userEvent.click(within(panel).getByRole("radio", { name: "Passed" }));
    await waitFor(() =>
      expect(mocks.swipeHistory).toHaveBeenLastCalledWith(expect.objectContaining({ direction: "PASS" }), "MOVIE"),
    );
  });
});

describe("Clearing", () => {
  it("asks first, and sends nothing on Cancel", async () => {
    renderScreen();
    await userEvent.click(await within(matchesPanel()).findByRole("button", { name: "Clear match history" }));
    const dialog = screen.getByRole("dialog", { name: "Clear your match history?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(mocks.clearHistory).not.toHaveBeenCalled();
  });

  it("clears matches and reloads the list empty", async () => {
    mocks.clearHistory.mockResolvedValue(true);
    renderScreen();
    await userEvent.click(await within(matchesPanel()).findByRole("button", { name: "Clear match history" }));
    mocks.matches.mockResolvedValue({ matches: [], nextToken: null });
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Clear" }));

    expect(await within(matchesPanel()).findByText("No matches yet")).toBeInTheDocument();
    expect(mocks.clearHistory).toHaveBeenCalledWith("MATCHES", "MOVIE");
    expect(within(matchesPanel()).queryByRole("button", { name: "Clear match history" })).not.toBeInTheDocument();
  });

  it("says swipes still count, and names the mode it covers", async () => {
    renderScreen("/history?tab=swipes&media=shows");
    const panel = screen.getByRole("tabpanel", { name: "My Swipes" });
    await userEvent.click(await within(panel).findByRole("button", { name: "Clear swipe history" }));
    const dialog = screen.getByRole("dialog", { name: "Clear your swipe history?" });
    expect(dialog).toHaveTextContent("Your swipes still count");
    expect(dialog).toHaveTextContent("Shows only");
  });

  it("isn't offered while a filter is on, since it clears more than is shown", async () => {
    renderScreen("/history?tab=swipes");
    const panel = screen.getByRole("tabpanel", { name: "My Swipes" });
    await within(panel).findByRole("button", { name: "Clear swipe history" });
    await userEvent.click(within(panel).getByRole("radio", { name: "Liked" }));
    await waitFor(() =>
      expect(within(panel).queryByRole("button", { name: "Clear swipe history" })).not.toBeInTheDocument(),
    );
  });

  it("keeps the list when clearing fails", async () => {
    mocks.clearHistory.mockRejectedValue(new Error("Nope"));
    renderScreen();
    await userEvent.click(await within(matchesPanel()).findByRole("button", { name: "Clear match history" }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Clear" }));

    expect(await screen.findByText("Nope")).toBeInTheDocument();
    expect(within(matchesPanel()).getByRole("button", { name: /Heat \(1995\)/ })).toBeInTheDocument();
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
    expect(mocks.watchOptions).toHaveBeenCalledWith(1, "MOVIE");
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

describe("Plex on a past match", () => {
  beforeEach(() => {
    mocks.plexStatus.mockResolvedValue({ availability: "NOT_IN_LIBRARY", canRequest: true });
  });

  async function openRequestDialog(): Promise<HTMLElement> {
    renderScreen("/history", true);
    await userEvent.click(await screen.findByRole("button", { name: /Heat/ }));
    await userEvent.click(await screen.findByRole("button", { name: "Request on Plex" }));
    return screen.getByRole("dialog", { name: "Request Heat?" });
  }

  it("waits for a match to be opened before asking", async () => {
    renderScreen("/history", true);
    await screen.findByRole("button", { name: /Heat/ });

    expect(mocks.plexStatus).not.toHaveBeenCalled();
  });

  it("requests from the sheet after confirming, leaving the sheet open", async () => {
    mocks.requestOnPlex.mockResolvedValue({ availability: "REQUESTED", canRequest: false });
    const dialog = await openRequestDialog();

    await userEvent.click(within(dialog).getByRole("button", { name: "Request" }));

    const sheet = screen.getByRole("dialog", { name: "Heat details" });
    expect(await within(sheet).findByText("Requested on Plex")).toBeInTheDocument();
    expect(mocks.requestOnPlex).toHaveBeenCalledWith(1, "MOVIE", undefined);
  });

  it("closes only the confirmation on Escape", async () => {
    await openRequestDialog();

    await userEvent.keyboard("{Escape}");

    expect(screen.queryByRole("dialog", { name: "Request Heat?" })).not.toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Heat details" })).toBeInTheDocument();
    expect(mocks.requestOnPlex).not.toHaveBeenCalled();
  });
});

describe("On a desktop", () => {
  let viewport: ReturnType<typeof fakeViewport>;

  beforeEach(() => {
    viewport = fakeViewport(1280);
  });

  afterEach(() => viewport.restore());

  it("features only the newest match, which still opens its details", async () => {
    mocks.matches.mockResolvedValue({ matches: [makeMatch(1, "Heat"), makeMatch(2, "Alien")], nextToken: null });
    renderScreen();

    const newest = await within(matchesPanel()).findByRole("button", { name: /Heat \(1995\)/ });
    expect(screen.getAllByText("Latest match")).toHaveLength(1);
    expect(newest).toContainElement(screen.getByText("Latest match"));

    await userEvent.click(newest);

    expect(screen.getByRole("dialog", { name: "Heat details" })).toBeInTheDocument();
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
    expect(mocks.matches).toHaveBeenLastCalledWith({ limit: 20, nextToken: "page-2" }, "MOVIE");
    expect(within(matchesPanel()).queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
  });

  it("pages swipes with their own token", async () => {
    mocks.swipeHistory
      .mockResolvedValueOnce({ entries: [makeEntry(2, "Alien", "LIKE")], nextToken: "swipes-2" })
      .mockResolvedValueOnce({ entries: [makeEntry(3, "Cats", "PASS")], nextToken: null });
    renderScreen("/history?tab=swipes");

    await userEvent.click(await screen.findByRole("button", { name: "Load more" }));

    expect(await screen.findByText("Cats")).toBeInTheDocument();
    expect(mocks.swipeHistory).toHaveBeenLastCalledWith({ limit: 20, nextToken: "swipes-2" }, "MOVIE");
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
