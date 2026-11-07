import { render } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { vi } from "vitest";
import { RoomContext, type RoomContextValue } from "@movie-date/frontend/context/RoomProvider";
import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import type { Member, Profile, Room } from "@movie-date/frontend/services/api";

export function makeMember(userId: string, displayName: string, isMe = false): Member {
  return { userId, displayName, avatarUrl: null, isMe };
}

export function makeRoom(overrides: Partial<Room> = {}): Room {
  return {
    id: "room-1",
    code: "ABC234",
    matchThreshold: 2,
    requireMajority: false,
    round: 1,
    plexAvailable: false,
    filters: { genreIds: [], services: [], cast: [], releaseDateGte: null, releaseDateLte: null },
    members: [makeMember("me", "Me", true), makeMember("u2", "Sam")],
    ...overrides,
  };
}

export function makeProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "me",
    email: "me@example.com",
    displayName: "Me",
    avatarUrl: null,
    plexLinked: false,
    ...overrides,
  };
}

function Path(): JSX.Element {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

export function fakeRoomContext(overrides: Partial<RoomContextValue> = {}): RoomContextValue {
  return {
    me: makeProfile(),
    room: makeRoom(),
    realtimeStatus: "live",
    deckVersion: 0,
    setRoom: vi.fn(),
    setMe: vi.fn(),
    refreshRoom: vi.fn().mockResolvedValue(undefined),
    goToMatch: vi.fn(),
    subscribeEvents: vi.fn(() => () => undefined),
    ...overrides,
  };
}

export function Providers({
  context,
  path = "/somewhere",
  children,
}: {
  context: RoomContextValue;
  path?: string;
  children: ReactNode;
}): JSX.Element {
  return (
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <RoomContext.Provider value={context}>
          {children}
          <Path />
        </RoomContext.Provider>
      </ToastProvider>
    </MemoryRouter>
  );
}

export function renderWithRoom(ui: JSX.Element, overrides: Partial<RoomContextValue> = {}, path?: string) {
  const context = fakeRoomContext(overrides);
  return {
    context,
    ...render(
      <Providers context={context} path={path}>
        {ui}
      </Providers>,
    ),
  };
}
