import { act, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, useLocation } from "react-router-dom";

const mocks = vi.hoisted(() => ({
  isSignedIn: vi.fn(),
  signIn: vi.fn(),
  authListeners: new Set<(signedIn: boolean) => void>(),
}));

vi.mock("@movie-date/frontend/services/auth", () => ({
  isSignedIn: mocks.isSignedIn,
  signIn: mocks.signIn,
  signOut: vi.fn(),
  signUp: vi.fn(),
  forgotPassword: vi.fn(),
  confirmForgotPassword: vi.fn(),
  onAuthChange: (listener: (signedIn: boolean) => void) => {
    mocks.authListeners.add(listener);
    return () => mocks.authListeners.delete(listener);
  },
}));

vi.mock("@movie-date/frontend/services/api", () => ({
  errorMessage: (error: Error) => error.message,
  api: {
    me: async () => ({ id: "me", email: "a@b.co", displayName: "Me", avatarUrl: null }),
    myRoom: async () => ({
      id: "r",
      code: "ABC234",
      matchThreshold: 2,
      requireMajority: false,
      round: 1,
      filters: { genreIds: [], services: [], cast: [] },
      members: [],
    }),
    pendingMatch: async () => null,
  },
}));
vi.mock("@movie-date/frontend/services/realtime", () => ({ subscribeToRoom: () => () => undefined }));

// The real screens belong to other suites; this one is about routing.
vi.mock("@movie-date/frontend/screens/Home", () => ({ default: () => <p>screen:home</p> }));
vi.mock("@movie-date/frontend/screens/Filters", () => ({ default: () => <p>screen:filters</p> }));
vi.mock("@movie-date/frontend/screens/ActorSearch", () => ({ default: () => <p>screen:actors</p> }));
vi.mock("@movie-date/frontend/screens/MatchFound", () => ({ default: () => <p>screen:match</p> }));
vi.mock("@movie-date/frontend/screens/History", () => ({ default: () => <p>screen:history</p> }));
vi.mock("@movie-date/frontend/screens/Members", () => ({ default: () => <p>screen:members</p> }));
vi.mock("@movie-date/frontend/screens/JoinInvite", () => ({ default: () => <p>screen:join</p> }));
vi.mock("@movie-date/frontend/screens/Profile", () => ({ default: () => <p>screen:profile</p> }));
vi.mock("@movie-date/frontend/screens/Settings", () => ({ default: () => <p>screen:settings</p> }));
vi.mock("@movie-date/frontend/screens/Tutorial", () => ({ default: () => <p>screen:tutorial</p> }));
vi.mock("@movie-date/frontend/components/JoinRoomDialog", () => ({ default: () => null }));

import userEvent from "@testing-library/user-event";
import { AppRoutes } from "@movie-date/frontend/AppRoutes";
import { AuthProvider } from "@movie-date/frontend/context/AuthProvider";
import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import { markTutorialSeen, resetTutorialSeen } from "@movie-date/frontend/services/tutorial";

function LocationProbe(): JSX.Element {
  const location = useLocation();
  return (
    <>
      <div data-testid="path">{location.pathname}</div>
      <div data-testid="from">{(location.state as { from?: string } | null)?.from ?? ""}</div>
    </>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
      <ToastProvider>
        <AuthProvider>
          <AppRoutes />
          <LocationProbe />
        </AuthProvider>
      </ToastProvider>
    </MemoryRouter>,
  );
}

const path = () => screen.getByTestId("path").textContent;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.authListeners.clear();
  mocks.isSignedIn.mockResolvedValue(true);
  resetTutorialSeen();
  markTutorialSeen();
});

describe("routes", () => {
  it.each([
    ["/", "screen:home"],
    ["/filters", "screen:filters"],
    ["/filters/actors", "screen:actors"],
    ["/match/m1", "screen:match"],
    ["/history", "screen:history"],
    ["/members", "screen:members"],
    ["/join/ABC234", "screen:join"],
    ["/profile", "screen:profile"],
    ["/settings", "screen:settings"],
    ["/tutorial", "screen:tutorial"],
  ])("%s renders its screen", async (route, text) => {
    renderAt(route);
    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("sends an unknown path home", async () => {
    renderAt("/nope");
    expect(await screen.findByText("screen:home")).toBeInTheDocument();
  });

  it("shows the bottom nav on home and filters only", async () => {
    const first = renderAt("/");
    await screen.findByText("screen:home");
    expect(screen.getByRole("navigation", { name: "Main" })).toBeInTheDocument();
    first.unmount();

    renderAt("/match/m1");
    await screen.findByText("screen:match");
    expect(screen.queryByRole("navigation", { name: "Main" })).not.toBeInTheDocument();
  });
});

describe("auth guard", () => {
  beforeEach(() => mocks.isSignedIn.mockResolvedValue(false));

  it("sends a signed-out visitor to login, remembering the path", async () => {
    renderAt("/history?tab=swipes");
    await waitFor(() => expect(path()).toBe("/login"));
    expect(screen.getByTestId("from")).toHaveTextContent("/history?tab=swipes");
  });

  it("returns an invite link visitor to it after login", async () => {
    mocks.signIn.mockImplementation(async () => {
      for (const listener of mocks.authListeners) listener(true);
    });
    renderAt("/join/ABC234");
    const user = userEvent.setup();

    await user.type(await screen.findByLabelText("EMAIL"), "a@b.co");
    await user.type(screen.getByLabelText("PASSWORD"), "secret1");
    await user.click(screen.getByRole("button", { name: "LOG IN" }));

    expect(await screen.findByText("screen:join")).toBeInTheDocument();
  });

  it("keeps the return path through the register and forgot password links", async () => {
    renderAt("/join/ABC234");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("link", { name: "No account yet? Sign up." }));
    expect(path()).toBe("/register");
    expect(screen.getByTestId("from")).toHaveTextContent("/join/ABC234");

    await user.click(screen.getByRole("link", { name: "Back to Login" }));
    await user.click(screen.getByRole("link", { name: "Forgot password?" }));
    expect(path()).toBe("/forgot-password");
    expect(screen.getByTestId("from")).toHaveTextContent("/join/ABC234");
  });

  it("returns to login when the session ends", async () => {
    mocks.isSignedIn.mockResolvedValue(true);
    renderAt("/");
    await screen.findByText("screen:home");

    act(() => {
      for (const listener of mocks.authListeners) listener(false);
    });

    await waitFor(() => expect(path()).toBe("/login"));
  });
});

describe("public screens", () => {
  it("sends someone already signed in home", async () => {
    renderAt("/login");
    expect(await screen.findByText("screen:home")).toBeInTheDocument();
  });

  it("ignores a return path that leaves the site", async () => {
    render(
      <MemoryRouter
        initialEntries={[{ pathname: "/login", state: { from: "//evil.example" } }]}
        future={{ v7_startTransition: false, v7_relativeSplatPath: true }}
      >
        <ToastProvider>
          <AuthProvider>
            <AppRoutes />
            <LocationProbe />
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );
    expect(await screen.findByText("screen:home")).toBeInTheDocument();
  });
});

describe("first run", () => {
  it("redirects to the tutorial, remembering the destination", async () => {
    resetTutorialSeen();
    renderAt("/join/ABC234");

    expect(await screen.findByText("screen:tutorial")).toBeInTheDocument();
    expect(screen.getByTestId("from")).toHaveTextContent("/join/ABC234");
  });

  it("doesn't redirect once the tutorial has been seen", async () => {
    renderAt("/");
    expect(await screen.findByText("screen:home")).toBeInTheDocument();
  });

  it("the tutorial stays reachable afterwards", async () => {
    renderAt("/tutorial");
    expect(await screen.findByText("screen:tutorial")).toBeInTheDocument();
  });
});
