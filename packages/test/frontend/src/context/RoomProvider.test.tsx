import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  me: vi.fn(),
  myRoom: vi.fn(),
  pendingMatch: vi.fn(),
  subscribeToRoom: vi.fn(),
  unsubscribe: vi.fn(),
}));

vi.mock("@movie-date/frontend/services/api", () => ({
  api: { me: mocks.me, myRoom: mocks.myRoom, pendingMatch: mocks.pendingMatch },
}));
vi.mock("@movie-date/frontend/services/realtime", () => ({ subscribeToRoom: mocks.subscribeToRoom }));

import { peekFilterDraft, stashFilterDraft } from "@movie-date/frontend/components/filters/filterDraft";
import { RoomProvider, type RoomContextValue } from "@movie-date/frontend/context/RoomProvider";
import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import { useRoom, useRoomEvents } from "@movie-date/frontend/hooks/useRoom";
import type { Match, Room, RoomEvent } from "@movie-date/frontend/services/api";
import type { RoomSubscriptionOptions } from "@movie-date/frontend/services/realtime";

const member = (userId: string, displayName: string, isMe = false) => ({
  userId,
  displayName,
  avatarUrl: null,
  isMe,
});

function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    code: "ABC234",
    matchThreshold: 2,
    requireMajority: false,
    round: 1,
    plexAvailable: false,
    filters: { genreIds: [], services: [], cast: [], releaseDateGte: null, releaseDateLte: null },
    members: [member("me", "Me", true), member("u2", "Sam")],
    ...overrides,
  };
}

function makeMatch(id: string): Match {
  return {
    id,
    roomId: "room-1",
    round: 1,
    matchedAt: "2026-01-01T00:00:00Z",
    movie: {
      id: 1,
      title: "Heat",
      overview: "",
      releaseYear: 1995,
      runtime: 170,
      voteAverage: 8,
      posterUrl: null,
      backdropUrl: null,
      genres: [],
    },
  };
}

let context: RoomContextValue;
let navigateTo: (path: string) => void;
const seenEvents: RoomEvent[] = [];

function Probe(): JSX.Element {
  context = useRoom();
  const location = useLocation();
  const navigate = useNavigate();
  navigateTo = navigate;
  useRoomEvents((event) => seenEvents.push(event));
  const state = location.state as { match?: Match } | null;
  return (
    <>
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="state-match">{state?.match?.id ?? ""}</div>
      <div data-testid="deck">{context.deckVersion}</div>
      <div data-testid="room">{context.room.id}</div>
    </>
  );
}

function renderProvider(initialPath = "/") {
  return render(
    <MemoryRouter
      initialEntries={[initialPath]}
      future={{ v7_startTransition: false, v7_relativeSplatPath: true }}
    >
      <ToastProvider>
        <RoomProvider>
          <Routes>
            <Route path="*" element={<Probe />} />
          </Routes>
        </RoomProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

function subscription(call = -1): RoomSubscriptionOptions {
  const calls = mocks.subscribeToRoom.mock.calls;
  return calls.at(call)?.[0] as RoomSubscriptionOptions;
}

async function emit(event: Partial<RoomEvent> & Pick<RoomEvent, "type">): Promise<void> {
  await act(async () => {
    subscription().onEvent({
      roomId: "room-1",
      movieId: null,
      matchId: null,
      round: null,
      actorId: null,
      ...event,
    });
    await Promise.resolve();
  });
}

const path = () => screen.getByTestId("path").textContent;
const deck = () => screen.getByTestId("deck").textContent;

beforeEach(() => {
  vi.clearAllMocks();
  seenEvents.length = 0;
  mocks.me.mockResolvedValue({ id: "me", email: "a@b.co", displayName: "Me", avatarUrl: null });
  mocks.myRoom.mockResolvedValue(makeRoom());
  mocks.pendingMatch.mockResolvedValue(null);
  mocks.subscribeToRoom.mockReturnValue(mocks.unsubscribe);
});

describe("loading", () => {
  it("creates the profile before reading the room, then renders children", async () => {
    let meDone = false;
    mocks.me.mockImplementation(async () => {
      await Promise.resolve();
      meDone = true;
      return { id: "me", email: "a@b.co", displayName: "Me", avatarUrl: null };
    });
    mocks.myRoom.mockImplementation(async () => {
      expect(meDone).toBe(true);
      return makeRoom();
    });

    renderProvider();

    expect(await screen.findByTestId("room")).toHaveTextContent("room-1");
    expect(context.me.displayName).toBe("Me");
  });

  it("shows a retry on failure, which recovers", async () => {
    mocks.me.mockRejectedValueOnce(new Error("down"));
    renderProvider();

    const retry = await screen.findByRole("button", { name: "Try again" });
    act(() => retry.click());

    expect(await screen.findByTestId("room")).toBeInTheDocument();
  });

  it("routes to a match the round already has", async () => {
    mocks.pendingMatch.mockResolvedValue(makeMatch("m1"));
    renderProvider();

    await waitFor(() => expect(path()).toBe("/match/m1"));
    expect(screen.getByTestId("state-match")).toHaveTextContent("m1");
  });
});

describe("events", () => {
  it("routes everyone to the match screen on MATCH_FOUND", async () => {
    renderProvider();
    await screen.findByTestId("room");

    await emit({ type: "MATCH_FOUND", matchId: "m2", movieId: 9 });

    expect(path()).toBe("/match/m2");
  });

  it("passes every event to useRoomEvents listeners", async () => {
    renderProvider();
    await screen.findByTestId("room");
    await emit({ type: "ROUND_RESET", round: 2 });
    expect(seenEvents.map((event) => event.type)).toEqual(["ROUND_RESET"]);
  });

  it("doesn't pull someone off a match they're reading, then catches up when they leave", async () => {
    renderProvider("/match/m1");
    await screen.findByTestId("room");

    await emit({ type: "MATCH_FOUND", matchId: "m2" });
    expect(path()).toBe("/match/m1");

    mocks.pendingMatch.mockResolvedValue(makeMatch("m2"));
    act(() => navigateTo("/"));

    await waitFor(() => expect(path()).toBe("/match/m2"));
  });

  it("doesn't bounce someone back to a match they walked away from", async () => {
    mocks.pendingMatch.mockResolvedValue(makeMatch("m1"));
    renderProvider();
    await waitFor(() => expect(path()).toBe("/match/m1"));

    act(() => navigateTo("/history"));
    await waitFor(() => expect(mocks.pendingMatch).toHaveBeenCalledTimes(2));

    await act(async () => {
      subscription().onResync?.();
      await Promise.resolve();
    });

    expect(path()).toBe("/history");
  });

  it("bumps deckVersion when filters change and not for the echo of the same room", async () => {
    renderProvider();
    await screen.findByTestId("room");
    expect(deck()).toBe("0");

    await emit({ type: "ROOM_UPDATED" });
    await waitFor(() => expect(mocks.myRoom).toHaveBeenCalledTimes(2));
    expect(deck()).toBe("0");

    mocks.myRoom.mockResolvedValue(
      makeRoom({ filters: { ...makeRoom().filters, genreIds: [28] } }),
    );
    await emit({ type: "ROOM_UPDATED" });
    await waitFor(() => expect(deck()).toBe("1"));
  });

  it("bumps deckVersion on a new round", async () => {
    renderProvider();
    await screen.findByTestId("room");

    mocks.myRoom.mockResolvedValue(makeRoom({ round: 2 }));
    await emit({ type: "ROUND_RESET", round: 2 });

    await waitFor(() => expect(deck()).toBe("1"));
  });

  it("leaves the deck alone for a threshold change", async () => {
    renderProvider();
    await screen.findByTestId("room");

    mocks.myRoom.mockResolvedValue(makeRoom({ matchThreshold: 3 }));
    await emit({ type: "ROOM_UPDATED" });

    await waitFor(() => expect(context.room.matchThreshold).toBe(3));
    expect(deck()).toBe("0");
  });

  it("refreshes members and toasts who came and went", async () => {
    renderProvider();
    await screen.findByTestId("room");

    mocks.myRoom.mockResolvedValue(
      makeRoom({ members: [member("me", "Me", true), member("u3", "Alex")] }),
    );
    await emit({ type: "MEMBERS_CHANGED" });

    expect(await screen.findByText("Alex joined the room")).toBeInTheDocument();
    expect(screen.getByText("Sam left the room")).toBeInTheDocument();
    expect(context.room.members.map((entry) => entry.userId)).toEqual(["me", "u3"]);
  });

  it("survives a failed refresh", async () => {
    renderProvider();
    await screen.findByTestId("room");

    mocks.myRoom.mockRejectedValueOnce(new Error("blip"));
    await emit({ type: "ROOM_UPDATED" });

    expect(screen.getByTestId("room")).toHaveTextContent("room-1");
  });
});

describe("realtime lifecycle", () => {
  it("resubscribes when the room changes", async () => {
    renderProvider();
    await screen.findByTestId("room");
    expect(subscription().roomId).toBe("room-1");

    act(() => context.setRoom(makeRoom({ id: "room-2" })));

    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
    expect(subscription().roomId).toBe("room-2");
    expect(deck()).toBe("1");
  });

  it("keeps the socket and the room load across navigation", async () => {
    renderProvider();
    await screen.findByTestId("room");
    mocks.me.mockClear();

    act(() => navigateTo("/history"));
    act(() => navigateTo("/members"));

    expect(mocks.subscribeToRoom).toHaveBeenCalledOnce();
    expect(mocks.unsubscribe).not.toHaveBeenCalled();
    expect(mocks.me).not.toHaveBeenCalled();
  });

  it("doesn't resubscribe for an update to the same room", async () => {
    renderProvider();
    await screen.findByTestId("room");

    act(() => context.setRoom(makeRoom({ matchThreshold: 4 })));

    expect(mocks.subscribeToRoom).toHaveBeenCalledOnce();
  });

  it("refetches pendingMatch and the room on resync", async () => {
    renderProvider();
    await screen.findByTestId("room");
    mocks.pendingMatch.mockResolvedValue(makeMatch("missed"));
    mocks.myRoom.mockClear();

    await act(async () => {
      subscription().onResync?.();
      await Promise.resolve();
    });

    await waitFor(() => expect(path()).toBe("/match/missed"));
    expect(mocks.myRoom).toHaveBeenCalledOnce();
  });

  it("exposes connection status", async () => {
    renderProvider();
    await screen.findByTestId("room");

    act(() => subscription().onStatusChange?.("offline"));

    expect(context.realtimeStatus).toBe("offline");
  });

  it("unsubscribes on unmount", async () => {
    const { unmount } = renderProvider();
    await screen.findByTestId("room");
    unmount();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
});

describe("mutations", () => {
  it("goToMatch hands the match to the screen and dedupes the event echo", async () => {
    renderProvider();
    await screen.findByTestId("room");

    act(() => context.goToMatch(makeMatch("m5")));
    expect(path()).toBe("/match/m5");
    expect(screen.getByTestId("state-match")).toHaveTextContent("m5");

    act(() => navigateTo("/"));
    await emit({ type: "MATCH_FOUND", matchId: "m5" });
    expect(path()).toBe("/");
  });

  it("a mutation's room beats a fetch already in flight", async () => {
    renderProvider();
    await screen.findByTestId("room");

    let finishFetch: (room: Room) => void = () => undefined;
    mocks.myRoom.mockImplementation(
      () =>
        new Promise<Room>((resolve) => {
          finishFetch = resolve;
        }),
    );
    let refresh: Promise<void> = Promise.resolve();
    act(() => {
      refresh = context.refreshRoom();
    });
    act(() => context.setRoom(makeRoom({ matchThreshold: 5 })));
    await act(async () => {
      finishFetch(makeRoom({ matchThreshold: 2 }));
      await refresh;
    });

    expect(context.room.matchThreshold).toBe(5);
  });

  it("setMe updates the profile", async () => {
    renderProvider();
    await screen.findByTestId("room");
    act(() => context.setMe({ ...context.me, displayName: "New" }));
    expect(context.me.displayName).toBe("New");
  });
});

describe("filter draft lifetime", () => {
  const draft = { genreIds: [18], cast: [], services: [] };

  function Goto({ to }: { to: string }): JSX.Element {
    const navigate = useNavigate();
    return <button onClick={() => navigate(to)}>go</button>;
  }

  async function renderAt(path: string, to: string) {
    mocks.me.mockResolvedValue({ id: "me", email: "a@b.c", displayName: "Me", avatarUrl: null });
    mocks.myRoom.mockResolvedValue(makeRoom());
    mocks.pendingMatch.mockResolvedValue(null);
    mocks.subscribeToRoom.mockReturnValue(mocks.unsubscribe);
    render(
      <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
        <ToastProvider>
          <RoomProvider>
            <Goto to={to} />
          </RoomProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    return screen.findByRole("button", { name: "go" });
  }

  it("survives the trip between Filters and ActorSearch", async () => {
    const go = await renderAt("/filters/actors", "/filters");
    stashFilterDraft("room-1", draft);
    act(() => go.click());
    expect(peekFilterDraft("room-1")).toEqual(draft);
  });

  it("is dropped when something takes the person anywhere else", async () => {
    const go = await renderAt("/filters/actors", "/match/m1");
    stashFilterDraft("room-1", draft);
    act(() => go.click());
    expect(peekFilterDraft("room-1")).toBeNull();
  });
});
