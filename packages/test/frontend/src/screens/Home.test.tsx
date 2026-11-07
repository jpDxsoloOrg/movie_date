import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  deck: vi.fn(),
  swipe: vi.fn(),
  undoSwipe: vi.fn(),
  trailer: vi.fn(),
  me: vi.fn(),
  myRoom: vi.fn(),
  pendingMatch: vi.fn(),
  subscribeToRoom: vi.fn(),
}));

vi.mock("@movie-date/frontend/services/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@movie-date/frontend/services/api")>()),
  api: mocks,
}));
vi.mock("@movie-date/frontend/services/realtime", () => ({ subscribeToRoom: mocks.subscribeToRoom }));
vi.mock("qrcode", () => ({ toDataURL: vi.fn(async () => "data:image/png;base64,AAAA") }));

import { RoomContext, RoomProvider, type RoomContextValue } from "@movie-date/frontend/context/RoomProvider";
import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import Home from "@movie-date/frontend/screens/Home";
import {
  ApiError,
  type DeckCard,
  type DeckPage,
  type Match,
  type Room,
  type RoomEvent,
} from "@movie-date/frontend/services/api";
import type { RoomSubscriptionOptions } from "@movie-date/frontend/services/realtime";

const CARD_WIDTH = 320;

/** jsdom has no PointerEvent, and without one fireEvent drops the coordinates. */
class FakePointerEvent extends MouseEvent {
  readonly pointerId: number;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 0;
  }
}
window.PointerEvent = FakePointerEvent as unknown as typeof PointerEvent;

function makeCard(id: number, overrides: Partial<DeckCard> = {}): DeckCard {
  return {
    likedByRoommate: false,
    movie: {
      id,
      title: `Movie ${id}`,
      overview: `Overview ${id}`,
      releaseYear: 1990 + id,
      runtime: 100 + id,
      voteAverage: 7.25,
      posterUrl: `https://img.test/${id}.jpg`,
      backdropUrl: null,
      genres: ["Action", "Drama"],
    },
    ...overrides,
  };
}

function makePage(ids: number[], nextPage: number | null = null): DeckPage {
  return { cards: ids.map((id) => makeCard(id)), nextPage };
}

function makeMatch(id: number): Match {
  return { id: `match-${id}`, roomId: "r", round: 1, matchedAt: "2026-01-01T00:00:00Z", movie: makeCard(id).movie };
}

// The session outlives Home on purpose, so each test gets a room of its own.
let roomCounter = 0;
function makeRoom(overrides: Partial<Room> = {}): Room {
  roomCounter += 1;
  return {
    id: `room-${roomCounter}`,
    code: "ABC234",
    matchThreshold: 2,
    requireMajority: false,
    round: 1,
    filters: { genreIds: [], services: [], cast: [], releaseDateGte: null, releaseDateLte: null },
    members: [
      { userId: "me", displayName: "Me", avatarUrl: null, isMe: true },
      { userId: "u2", displayName: "Sam", avatarUrl: null, isMe: false },
    ],
    ...overrides,
  };
}

function deferred<TValue>(): {
  promise: Promise<TValue>;
  resolve: (value: TValue) => void;
  reject: (reason: unknown) => void;
} {
  let resolvePromise: (value: TValue) => void = () => undefined;
  let rejectPromise: (reason: unknown) => void = () => undefined;
  const promise = new Promise<TValue>((resolveFn, rejectFn) => {
    resolvePromise = resolveFn;
    rejectPromise = rejectFn;
  });
  return { promise, resolve: resolvePromise, reject: rejectPromise };
}

function LocationProbe(): JSX.Element {
  return <output data-testid="path">{useLocation().pathname}</output>;
}

function shell(children: ReactNode): JSX.Element {
  return (
    <MemoryRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={children} />
          <Route path="*" element={null} />
        </Routes>
        <LocationProbe />
      </ToastProvider>
    </MemoryRouter>
  );
}

function roomValue(overrides: Partial<RoomContextValue> = {}): RoomContextValue {
  return {
    me: { id: "me", email: "me@test.dev", displayName: "Me", avatarUrl: null },
    room: makeRoom(),
    realtimeStatus: "live",
    deckVersion: 0,
    setRoom: vi.fn(),
    setMe: vi.fn(),
    refreshRoom: vi.fn(),
    goToMatch: vi.fn(),
    subscribeEvents: vi.fn(() => () => undefined),
    ...overrides,
  };
}

function renderHome(overrides: Partial<RoomContextValue> = {}): ReturnType<typeof render> & { value: RoomContextValue } {
  const value = roomValue(overrides);
  const view = render(shell(<RoomContext.Provider value={value}><Home /></RoomContext.Provider>));
  return { ...view, value };
}

const topCard = (title: string): Promise<HTMLElement> => screen.findByRole("article", { name: title });
const pressKey = (key: string, target: Element | Window = window): boolean => fireEvent.keyDown(target, { key });

let clock = 1000;

/** Each step advances the event clock, so velocity is what the test says it is. */
function drag(card: HTMLElement, steps: number[], { stepMs = 200, release = true } = {}): void {
  fireEvent.pointerDown(card, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
  for (const clientX of steps) {
    clock += stepMs;
    fireEvent.pointerMove(card, { pointerId: 1, clientX, clientY: 0 });
  }
  if (release) {
    clock += 1;
    fireEvent.pointerUp(card, { pointerId: 1, clientX: steps.at(-1) ?? 0, clientY: 0 });
  }
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.swipe.mockImplementation(async (movieId: number, direction: string) => ({ movieId, direction, match: null }));
  mocks.undoSwipe.mockImplementation(async (movieId: number) => ({ movieId, undone: true }));
  mocks.trailer.mockResolvedValue("yt-123");
  mocks.pendingMatch.mockResolvedValue(null);
  mocks.subscribeToRoom.mockReturnValue(() => undefined);

  vi.spyOn(Event.prototype, "timeStamp", "get").mockImplementation(() => clock);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: CARD_WIDTH,
    height: 480,
  } as DOMRect);
  HTMLElement.prototype.setPointerCapture = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Home deck states", () => {
  it("shows a skeleton, then the top card with its details", async () => {
    const page = deferred<DeckPage>();
    mocks.deck.mockReturnValue(page.promise);
    renderHome();
    expect(screen.getByRole("status", { name: "Loading movies" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Like" })).toBeDisabled();

    await act(async () => page.resolve(makePage([1, 2])));
    const card = within(await topCard("Movie 1"));
    expect(card.getByRole("heading", { name: "Movie 1, 1991" })).toBeInTheDocument();
    expect(card.getByText("Action, Drama")).toBeInTheDocument();
    expect(card.getByText("101 min | 7.3/10")).toBeInTheDocument();
    expect(card.getByText("Overview 1")).toBeInTheDocument();
  });

  it("renders no more than three cards", async () => {
    mocks.deck.mockResolvedValue(makePage([1, 2, 3, 4, 5, 6, 7]));
    renderHome();
    await topCard("Movie 1");
    expect(screen.getByText("Overview 3")).toBeInTheDocument();
    expect(screen.queryByText("Overview 4")).not.toBeInTheDocument();
  });

  it("offers a retry when the deck fails to load", async () => {
    mocks.deck.mockRejectedValueOnce(new ApiError("TMDB is down", "UPSTREAM"));
    mocks.deck.mockResolvedValueOnce(makePage([1]));
    renderHome();
    expect(await screen.findByRole("alert")).toHaveTextContent("TMDB is down");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await topCard("Movie 1");
  });

  it("ends on a real state that leads to Filters", async () => {
    mocks.deck.mockResolvedValue(makePage([]));
    renderHome();
    await screen.findByRole("heading", { name: "No more movies" });
    await userEvent.click(screen.getByRole("button", { name: "Change Filters" }));
    expect(screen.getByTestId("path")).toHaveTextContent("/filters");
  });

  it("reaches the end state after the last card, with Undo still available", async () => {
    mocks.deck.mockResolvedValue(makePage([1]));
    renderHome();
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await screen.findByRole("heading", { name: "No more movies" });
    expect(screen.getByRole("button", { name: "Like" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  });

  it("keeps walking when a page comes back empty but has a next page", async () => {
    mocks.deck.mockResolvedValueOnce(makePage([], 6)).mockResolvedValueOnce(makePage([9]));
    renderHome();
    await topCard("Movie 9");
    expect(mocks.deck).toHaveBeenLastCalledWith(6);
    expect(screen.queryByRole("heading", { name: "No more movies" })).not.toBeInTheDocument();
  });

  it("badges a card a roommate liked", async () => {
    mocks.deck.mockResolvedValue({ cards: [makeCard(1, { likedByRoommate: true }), makeCard(2)], nextPage: null });
    renderHome();
    expect(within(await topCard("Movie 1")).getByText("A roommate liked this")).toBeInTheDocument();
    pressKey("ArrowLeft");
    expect(within(await topCard("Movie 2")).queryByText("A roommate liked this")).not.toBeInTheDocument();
  });

  it("falls back to a placeholder when a poster fails", async () => {
    mocks.deck.mockResolvedValue(makePage([1]));
    const { container } = renderHome();
    await topCard("Movie 1");
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("Home dragging", () => {
  beforeEach(() => {
    mocks.deck.mockResolvedValue(makePage([1, 2, 3]));
  });

  it("moves and rotates with the pointer, and shows Watch Movie past 20%", async () => {
    renderHome();
    const card = await topCard("Movie 1");
    drag(card, [40], { release: false });
    expect(card.style.transform).toContain("translate3d(40px");
    expect(card.style.transform).toContain("rotate(2.25deg)");
    expect(screen.queryByText("Watch Movie")).not.toBeInTheDocument();

    clock += 200;
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 80, clientY: 0 });
    expect(screen.getByText("Watch Movie")).toBeInTheDocument();
  });

  it("likes on a drag past the threshold and promotes the next card", async () => {
    renderHome();
    drag(await topCard("Movie 1"), [60, 120]);
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalledWith(1, "LIKE"));
    await topCard("Movie 2");
  });

  it("passes on a left drag and shows Don't Watch", async () => {
    renderHome();
    const card = await topCard("Movie 1");
    drag(card, [-60, -120], { release: false });
    expect(screen.getByText("Don't Watch")).toBeInTheDocument();
    fireEvent.pointerUp(card, { pointerId: 1, clientX: -120, clientY: 0 });
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalledWith(1, "PASS"));
  });

  it("springs back from a short, slow drag without swiping or opening details", async () => {
    renderHome();
    const card = await topCard("Movie 1");
    drag(card, [30, 60]);
    expect(card.style.transform).toBe("");
    expect(screen.getByRole("article", { name: "Movie 1" })).toBe(card);
    expect(mocks.swipe).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("commits a fast flick short of the threshold", async () => {
    renderHome();
    drag(await topCard("Movie 1"), [20, 60], { stepMs: 16 });
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalledWith(1, "LIKE"));
  });

  it("doesn't count a flick the person held still after", async () => {
    renderHome();
    const card = await topCard("Movie 1");
    drag(card, [20, 60], { stepMs: 16, release: false });
    clock += 300;
    fireEvent.pointerUp(card, { pointerId: 1, clientX: 60, clientY: 0 });
    expect(mocks.swipe).not.toHaveBeenCalled();
  });

  it("drops the drag if the browser cancels the pointer", async () => {
    renderHome();
    const card = await topCard("Movie 1");
    drag(card, [120], { release: false });
    fireEvent.pointerCancel(card, { pointerId: 1 });
    expect(card.style.transform).toBe("");
    expect(screen.queryByText("Watch Movie")).not.toBeInTheDocument();
    expect(mocks.swipe).not.toHaveBeenCalled();
  });

  it("ignores a secondary button", async () => {
    renderHome();
    const card = await topCard("Movie 1");
    fireEvent.pointerDown(card, { pointerId: 1, button: 2, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(card, { pointerId: 1, clientX: 200, clientY: 0 });
    expect(card.style.transform).toBe("");
  });

  it("sends the card off screen and removes it after the animation", async () => {
    renderHome();
    const card = await topCard("Movie 1");
    drag(card, [60, 120]);
    expect(card.style.transform).toContain("rotate(28deg)");
    expect(card).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Watch Movie")).toBeInTheDocument();
    await waitFor(() => expect(card).not.toBeInTheDocument(), { timeout: 1000 });
  });

  it("stops touch drags from scrolling the page", () => {
    const css = readFileSync(resolve(__dirname, "../../../../frontend/src/components/deck/SwipeCard.css"), "utf8");
    expect(css).toMatch(/\.deck-card \{[^}]*touch-action: none/);
  });
});

describe("Home details sheet", () => {
  beforeEach(() => {
    mocks.deck.mockResolvedValue(makePage([1, 2]));
  });

  /** What a tap really sends: a click always follows the release. */
  const tap = (card: HTMLElement): void => {
    drag(card, [4]);
    fireEvent.click(card);
  };

  it("waits for the click to open, so the tap's own click can't land on the sheet", async () => {
    renderHome();
    const card = await topCard("Movie 1");
    drag(card, [4]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(card);
    expect(await screen.findByRole("dialog", { name: "Movie 1 details" })).toBeInTheDocument();
  });

  it("isn't opened by the click at the end of a mouse drag", async () => {
    renderHome();
    const card = await topCard("Movie 1");
    drag(card, [25]);
    fireEvent.click(card);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    tap(card);
    expect(await screen.findByRole("dialog", { name: "Movie 1 details" })).toBeInTheDocument();
  });

  it("leaves a press on the info button to the button, and opens only once", async () => {
    renderHome();
    const card = await topCard("Movie 1");
    const info = within(card).getByRole("button", { name: "Details for Movie 1" });
    const capture = vi.spyOn(card, "setPointerCapture");
    fireEvent.pointerDown(info, { pointerId: 1, button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerUp(info, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(capture).not.toHaveBeenCalled();
    fireEvent.click(info);
    expect(await screen.findAllByRole("dialog")).toHaveLength(1);
    expect(mocks.trailer).toHaveBeenCalledTimes(1);
  });

  it("autoplays the trailer, and says it may", async () => {
    renderHome();
    tap(await topCard("Movie 1"));
    const player = await screen.findByTitle("Movie 1 trailer");
    expect(player.getAttribute("allow")).toContain("autoplay");
  });

  it("opens on a tap with the trailer and details, and closing removes the player", async () => {
    renderHome();
    tap(await topCard("Movie 1"));
    const sheet = within(await screen.findByRole("dialog", { name: "Movie 1 details" }));
    const player = await sheet.findByTitle("Movie 1 trailer");
    expect(player).toHaveAttribute("src", "https://www.youtube-nocookie.com/embed/yt-123?autoplay=1");
    expect(mocks.trailer).toHaveBeenCalledWith(1);
    expect(sheet.getByRole("heading", { name: "Movie 1" })).toBeInTheDocument();
    expect(sheet.getByText("Overview 1")).toBeInTheDocument();
    expect(mocks.swipe).not.toHaveBeenCalled();

    await userEvent.click(sheet.getByRole("button", { name: "Close" }));
    expect(screen.queryByTitle("Movie 1 trailer")).not.toBeInTheDocument();
  });

  it("opens from the keyboard through the details button", async () => {
    renderHome();
    await userEvent.click(within(await topCard("Movie 1")).getByRole("button", { name: "Details for Movie 1" }));
    expect(await screen.findByRole("dialog", { name: "Movie 1 details" })).toBeInTheDocument();
  });

  it("says so when there is no trailer", async () => {
    mocks.trailer.mockResolvedValue(null);
    renderHome();
    tap(await topCard("Movie 1"));
    expect(await screen.findByText("No trailer available")).toBeInTheDocument();
  });

  it("can retry a failed trailer", async () => {
    mocks.trailer.mockRejectedValueOnce(new ApiError("No luck", "UPSTREAM"));
    renderHome();
    tap(await topCard("Movie 1"));
    expect(await screen.findByText("Couldn't load the trailer")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByTitle("Movie 1 trailer")).toBeInTheDocument();
  });
});

describe("Home buttons and keyboard", () => {
  beforeEach(() => {
    mocks.deck.mockResolvedValue(makePage([1, 2, 3]));
  });

  it("swipes with the Pass and Like buttons", async () => {
    renderHome();
    await topCard("Movie 1");
    await userEvent.click(screen.getByRole("button", { name: "Pass" }));
    await userEvent.click(screen.getByRole("button", { name: "Like" }));
    expect(mocks.swipe).toHaveBeenCalledWith(1, "PASS");
    expect(mocks.swipe).toHaveBeenCalledWith(2, "LIKE");
    await topCard("Movie 3");
  });

  it("swipes and undoes with the arrow keys and Backspace", async () => {
    renderHome();
    await topCard("Movie 1");
    pressKey("ArrowLeft");
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalledWith(1, "PASS"));
    pressKey("ArrowRight");
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalledWith(2, "LIKE"));
    pressKey("Backspace");
    await waitFor(() => expect(mocks.undoSwipe).toHaveBeenCalledWith(2));
  });

  it("leaves the keys alone while a dialog is open", async () => {
    renderHome();
    const card = await topCard("Movie 1");
    drag(card, [4]);
    fireEvent.click(card);
    await screen.findByRole("dialog");
    pressKey("ArrowRight");
    pressKey("Backspace");
    expect(mocks.swipe).not.toHaveBeenCalled();
  });

  it("leaves the keys alone in a text field and with modifiers", async () => {
    renderHome();
    await topCard("Movie 1");
    const input = document.body.appendChild(document.createElement("input"));
    pressKey("ArrowLeft", input);
    input.remove();
    fireEvent.keyDown(window, { key: "ArrowLeft", altKey: true });
    fireEvent.keyDown(window, { key: "ArrowRight", repeat: true });
    expect(mocks.swipe).not.toHaveBeenCalled();
  });
});

describe("Home optimistic swipes", () => {
  it("takes every swipe of a fast burst, without waiting on the server", async () => {
    mocks.deck.mockResolvedValue(makePage([1, 2, 3, 4]));
    mocks.swipe.mockReturnValue(new Promise(() => undefined));
    renderHome();
    await topCard("Movie 1");

    act(() => {
      pressKey("ArrowRight");
      pressKey("ArrowLeft");
      pressKey("ArrowRight");
    });

    await topCard("Movie 4");
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalledTimes(3));
    expect(mocks.swipe.mock.calls).toEqual([
      [1, "LIKE"],
      [2, "PASS"],
      [3, "LIKE"],
    ]);
  });

  it("can drag the next card while the last one is still flying off", async () => {
    mocks.deck.mockResolvedValue(makePage([1, 2, 3]));
    renderHome();
    drag(await topCard("Movie 1"), [60, 120]);
    drag(await topCard("Movie 2"), [-60, -120]);
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalledWith(2, "PASS"));
  });

  it("puts a refused swipe's card back on top and tells the person", async () => {
    mocks.deck.mockResolvedValue(makePage([1, 2]));
    mocks.swipe.mockRejectedValueOnce(new ApiError("Nope", "VALIDATION"));
    renderHome();
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await topCard("Movie 1");
    expect(await screen.findByText("Nope")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(mocks.swipe).toHaveBeenCalledTimes(1);
  });

  it("restores several failed swipes in their original order", async () => {
    mocks.deck.mockResolvedValue(makePage([1, 2, 3]));
    const failures = [deferred<never>(), deferred<never>()];
    mocks.swipe.mockReturnValueOnce(failures[0]?.promise).mockReturnValueOnce(failures[1]?.promise);
    renderHome();
    await topCard("Movie 1");
    pressKey("ArrowRight");
    pressKey("ArrowRight");
    await topCard("Movie 3");
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalledTimes(2));

    await act(async () => {
      failures[1]?.reject(new ApiError("Nope", "VALIDATION"));
      await Promise.resolve();
      failures[0]?.reject(new ApiError("Nope", "VALIDATION"));
    });
    await topCard("Movie 1");
    pressKey("ArrowLeft");
    await topCard("Movie 2");
    pressKey("ArrowLeft");
    await topCard("Movie 3");
  });

  it("retries a network blip rather than undoing the person's swipe", async () => {
    mocks.deck.mockResolvedValue(makePage([1, 2]));
    mocks.swipe.mockRejectedValueOnce(new ApiError("Offline", "NETWORK"));
    renderHome();
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalledTimes(2), { timeout: 1500 });
    await topCard("Movie 2");
    expect(screen.queryByText("Offline")).not.toBeInTheDocument();
  });

  it("routes to the match the swipe returned", async () => {
    mocks.deck.mockResolvedValue(makePage([1, 2]));
    mocks.swipe.mockResolvedValueOnce({ movieId: 1, direction: "LIKE", match: makeMatch(1) });
    const { value } = renderHome();
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await waitFor(() => expect(value.goToMatch).toHaveBeenCalledWith(makeMatch(1)));
  });
});

describe("Home undo", () => {
  beforeEach(() => {
    mocks.deck.mockResolvedValue(makePage([1, 2, 3]));
  });

  const undoButton = (): HTMLElement => screen.getByRole("button", { name: "Undo" });

  it("has nothing to undo at first", async () => {
    renderHome();
    await topCard("Movie 1");
    expect(undoButton()).toBeDisabled();
  });

  it("walks back one swipe at a time", async () => {
    renderHome();
    await topCard("Movie 1");
    pressKey("ArrowRight");
    pressKey("ArrowLeft");
    await topCard("Movie 3");

    await userEvent.click(undoButton());
    await topCard("Movie 2");
    await waitFor(() => expect(mocks.undoSwipe).toHaveBeenCalledWith(2));

    await userEvent.click(undoButton());
    await topCard("Movie 1");
    await waitFor(() => expect(mocks.undoSwipe).toHaveBeenCalledWith(1));
    expect(undoButton()).toBeDisabled();
  });

  it("doesn't leave the swipe overlay on a card that comes back", async () => {
    renderHome();
    drag(await topCard("Movie 1"), [60, 120]);
    await userEvent.click(undoButton());
    await topCard("Movie 1");
    expect(screen.queryByText("Watch Movie")).not.toBeInTheDocument();
  });

  it("waits for the swipe to land before undoing it", async () => {
    const landing = deferred<{ movieId: number; direction: string; match: null }>();
    mocks.swipe.mockReturnValueOnce(landing.promise);
    renderHome();
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalled());
    pressKey("Backspace");
    await topCard("Movie 1");
    expect(mocks.undoSwipe).not.toHaveBeenCalled();

    await act(async () => landing.resolve({ movieId: 1, direction: "LIKE", match: null }));
    await waitFor(() => expect(mocks.undoSwipe).toHaveBeenCalledWith(1));
  });

  it("skips the undo if the swipe it was undoing failed", async () => {
    const landing = deferred<never>();
    mocks.swipe.mockReturnValueOnce(landing.promise);
    renderHome();
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await waitFor(() => expect(mocks.swipe).toHaveBeenCalled());
    pressKey("Backspace");
    await act(async () => landing.reject(new ApiError("Nope", "VALIDATION")));
    await topCard("Movie 1");
    expect(mocks.undoSwipe).not.toHaveBeenCalled();
    expect(screen.queryByText("Nope")).not.toBeInTheDocument();
  });

  it("removes the card again if the server refuses because it matched", async () => {
    mocks.undoSwipe.mockResolvedValue({ movieId: 1, undone: false });
    renderHome();
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await topCard("Movie 2");
    pressKey("Backspace");
    expect(await screen.findByText("That movie already matched, so it can't be undone.")).toBeInTheDocument();
    await topCard("Movie 2");
    expect(undoButton()).toBeDisabled();
  });

  it("keeps the swipe undoable if the undo request fails", async () => {
    mocks.undoSwipe.mockRejectedValueOnce(new ApiError("Try later", "NETWORK"));
    renderHome();
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await topCard("Movie 2");
    pressKey("Backspace");
    expect(await screen.findByText("Try later")).toBeInTheDocument();
    await topCard("Movie 2");
    expect(undoButton()).toBeEnabled();
  });

  it("survives a trip to another screen in the same round", async () => {
    const room = makeRoom();
    const first = renderHome({ room });
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await topCard("Movie 2");
    first.unmount();

    mocks.deck.mockResolvedValue(makePage([2, 3]));
    renderHome({ room });
    await topCard("Movie 2");
    await userEvent.click(undoButton());
    await topCard("Movie 1");
    await waitFor(() => expect(mocks.undoSwipe).toHaveBeenCalledWith(1));
  });
});

describe("Home paging and preloading", () => {
  it("fetches the next page before the deck runs out, not at the start", async () => {
    mocks.deck.mockResolvedValueOnce(makePage([1, 2, 3, 4, 5, 6, 7], 2));
    mocks.deck.mockResolvedValueOnce(makePage([8, 9]));
    renderHome();
    await topCard("Movie 1");
    expect(mocks.deck).toHaveBeenCalledTimes(1);

    pressKey("ArrowLeft");
    await topCard("Movie 2");
    expect(mocks.deck).toHaveBeenCalledTimes(1);

    pressKey("ArrowLeft");
    await waitFor(() => expect(mocks.deck).toHaveBeenLastCalledWith(2));
    expect(mocks.deck).toHaveBeenCalledTimes(2);
  });

  it("doesn't deal a card twice or deal one that was just swiped", async () => {
    const pageTwo = deferred<DeckPage>();
    mocks.deck.mockResolvedValueOnce(makePage([1, 2], 2)).mockReturnValueOnce(pageTwo.promise);
    renderHome();
    await topCard("Movie 1");
    pressKey("ArrowLeft");
    await topCard("Movie 2");
    await act(async () => pageTwo.resolve(makePage([1, 2, 3])));

    pressKey("ArrowLeft");
    await topCard("Movie 3");
    pressKey("ArrowLeft");
    await screen.findByRole("heading", { name: "No more movies" });
  });

  it("shows a retry only if a failed page actually leaves the deck empty", async () => {
    mocks.deck.mockResolvedValueOnce(makePage([1], 2));
    mocks.deck.mockRejectedValueOnce(new ApiError("Page failed", "UPSTREAM"));
    mocks.deck.mockRejectedValueOnce(new ApiError("Page failed", "UPSTREAM"));
    mocks.deck.mockResolvedValueOnce(makePage([2]));
    renderHome();
    await topCard("Movie 1");
    await waitFor(() => expect(mocks.deck).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    pressKey("ArrowLeft");
    expect(await screen.findByRole("alert")).toHaveTextContent("Page failed");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    await topCard("Movie 2");
  });

  it("preloads the posters past the visible stack", async () => {
    const requested: string[] = [];
    vi.stubGlobal(
      "Image",
      class {
        set src(url: string) {
          requested.push(url);
        }
      },
    );
    mocks.deck.mockResolvedValue(makePage([1, 2, 3, 4, 5, 6, 7, 8, 9]));
    renderHome();
    await topCard("Movie 1");
    expect(requested).toEqual([4, 5, 6, 7, 8].map((id) => `https://img.test/${id}.jpg`));

    pressKey("ArrowLeft");
    await topCard("Movie 2");
    expect(requested).toContain("https://img.test/9.jpg");
    expect(new Set(requested).size).toBe(requested.length);
  });
});

describe("Home deck resets", () => {
  async function renderLive(room: Room): Promise<(event: RoomEvent) => void> {
    mocks.me.mockResolvedValue({ id: "me", email: "me@test.dev", displayName: "Me", avatarUrl: null });
    mocks.myRoom.mockResolvedValue(room);
    render(shell(<RoomProvider><Home /></RoomProvider>));
    await waitFor(() => expect(mocks.subscribeToRoom).toHaveBeenCalled());
    const [options] = mocks.subscribeToRoom.mock.lastCall as [RoomSubscriptionOptions];
    return options.onEvent;
  }

  const eventFor = (room: Room, type: RoomEvent["type"], round: number | null = null): RoomEvent => ({
    roomId: room.id,
    type,
    round,
    movieId: null,
    matchId: null,
    actorId: "u2",
  });

  it("reloads the deck when ROOM_UPDATED brings new filters", async () => {
    const room = makeRoom();
    mocks.deck.mockResolvedValueOnce(makePage([1, 2]));
    const emit = await renderLive(room);
    await topCard("Movie 1");

    mocks.deck.mockResolvedValueOnce(makePage([7, 8]));
    mocks.myRoom.mockResolvedValue({ ...room, filters: { ...room.filters, genreIds: [28] } });
    await act(async () => emit(eventFor(room, "ROOM_UPDATED")));
    await topCard("Movie 7");
    expect(screen.queryByText("Overview 1")).not.toBeInTheDocument();
    expect(mocks.deck).toHaveBeenLastCalledWith(1);
  });

  it("restarts the deck and drops the old round's undo stack on ROUND_RESET", async () => {
    const room = makeRoom();
    mocks.deck.mockResolvedValueOnce(makePage([1, 2]));
    const emit = await renderLive(room);
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await topCard("Movie 2");
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();

    mocks.deck.mockResolvedValueOnce(makePage([1, 2]));
    mocks.myRoom.mockResolvedValue({ ...room, round: 2 });
    await act(async () => emit(eventFor(room, "ROUND_RESET", 2)));
    await topCard("Movie 1");
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
  });

  it("doesn't reset someone mid-swipe for a threshold change", async () => {
    const room = makeRoom();
    mocks.deck.mockResolvedValue(makePage([1, 2]));
    const emit = await renderLive(room);
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await topCard("Movie 2");

    mocks.myRoom.mockResolvedValue({ ...room, matchThreshold: 3 });
    await act(async () => emit(eventFor(room, "ROOM_UPDATED")));
    await topCard("Movie 2");
    expect(mocks.deck).toHaveBeenCalledTimes(1);
  });

  it("keeps a swipe still in flight out of the reloaded deck, and keeps its undo", async () => {
    const room = makeRoom();
    mocks.deck.mockResolvedValueOnce(makePage([1, 2]));
    mocks.swipe.mockReturnValueOnce(new Promise(() => undefined));
    const emit = await renderLive(room);
    await topCard("Movie 1");
    pressKey("ArrowRight");
    await topCard("Movie 2");

    mocks.deck.mockResolvedValueOnce(makePage([1, 5]));
    mocks.myRoom.mockResolvedValue({ ...room, filters: { ...room.filters, genreIds: [28] } });
    await act(async () => emit(eventFor(room, "ROOM_UPDATED")));
    await topCard("Movie 5");
    expect(screen.getByRole("button", { name: "Undo" })).toBeEnabled();
  });

  it("keeps a trailer open through a roommate's filter change", async () => {
    const room = makeRoom();
    mocks.deck.mockResolvedValue(makePage([1, 2]));
    mocks.trailer.mockResolvedValue("yt-123");
    const emit = await renderLive(room);
    const card = await topCard("Movie 1");
    drag(card, [4]);
    fireEvent.click(card);
    await screen.findByTitle("Movie 1 trailer");

    mocks.myRoom.mockResolvedValue({ ...room, filters: { ...room.filters, genreIds: [28] } });
    await act(async () => emit(eventFor(room, "ROOM_UPDATED")));
    await waitFor(() => expect(mocks.deck).toHaveBeenCalledTimes(2));
    expect(screen.getByTitle("Movie 1 trailer")).toBeInTheDocument();
  });
});

describe("Home room code and invite", () => {
  beforeEach(() => {
    mocks.deck.mockResolvedValue(makePage([1]));
  });

  const openInvite = async (): Promise<ReturnType<typeof within>> => {
    await userEvent.click(screen.getByRole("button", { name: "Room code ABC234. Invite someone" }));
    return within(await screen.findByRole("dialog", { name: "Invite to room" }));
  };

  it("shows the code, and tapping it opens the invite with a link and QR code", async () => {
    renderHome();
    expect(screen.getByText("ABC234")).toBeInTheDocument();
    const sheet = await openInvite();
    expect(sheet.getByText(`${window.location.origin}/join/ABC234`)).toBeInTheDocument();
    expect(await sheet.findByAltText("QR code for the invite link")).toHaveAttribute(
      "src",
      "data:image/png;base64,AAAA",
    );
  });

  it("copies the link", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole("button", { name: "Room code ABC234. Invite someone" }));
    await user.click(await screen.findByRole("button", { name: "Copy Link" }));
    expect(await screen.findByText("Invite link copied")).toBeInTheDocument();
    await expect(navigator.clipboard.readText()).resolves.toBe(`${window.location.origin}/join/ABC234`);
  });

  it("uses Web Share where the browser has it, and a dismissed share isn't an error", async () => {
    const share = vi.fn().mockRejectedValue(new DOMException("Cancelled", "AbortError"));
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator) as Navigator, { share }));
    renderHome();
    const sheet = await openInvite();
    await userEvent.click(sheet.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(share).toHaveBeenCalled());
    expect(share.mock.calls[0]?.[0]).toMatchObject({ url: `${window.location.origin}/join/ABC234` });
    expect(screen.queryByText("Invite link copied")).not.toBeInTheDocument();
  });
});
