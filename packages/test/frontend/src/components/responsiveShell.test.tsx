import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signOut: vi.fn(), revokeSessions: vi.fn(async () => undefined) }));
vi.mock("@movie-date/frontend/services/auth", () => auth);
vi.mock("@movie-date/frontend/components/JoinRoomDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <p>join-dialog</p> : null),
}));

import { PageActions } from "@movie-date/frontend/components/PageHeader";
import { PageLayout } from "@movie-date/frontend/components/PageLayout";
import { ModeContext, modeValue } from "@movie-date/frontend/mode/ModeProvider";
import { fakeViewport } from "../support/viewport";

const DESKTOP = 1280;
const TABLET = 800;
const PHONE = 390;

function Path(): JSX.Element {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderLayout(ui: JSX.Element, path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
      {ui}
      <Path />
    </MemoryRouter>,
  );
}

const mainNav = () => screen.getByRole("navigation", { name: "Main" });

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllGlobals());

describe("desktop shell", () => {
  beforeEach(() => {
    fakeViewport(DESKTOP);
  });

  it("swaps the app bar, drawer and bottom nav for a sidebar", () => {
    renderLayout(<PageLayout bottomNav>content</PageLayout>);

    expect(screen.queryByRole("button", { name: "Open menu" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("navigation")).toHaveLength(1);
    expect(mainNav().className).not.toContain("rail");
  });

  it("reaches everything the drawer and bottom nav did", async () => {
    renderLayout(<PageLayout>content</PageLayout>);
    const nav = within(mainNav());

    for (const [name, href] of [
      ["Home", "/"],
      ["Search", "/filters"],
      ["History", "/history"],
      ["Room Members", "/members"],
      ["Profile", "/profile"],
      ["Settings", "/settings"],
      ["Tutorial", "/tour"],
    ] as const) {
      expect(nav.getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(nav.getByText(/^Version v/)).toBeInTheDocument();
    expect(nav.getByText(/not endorsed or certified by TMDB/)).toBeInTheDocument();

    await userEvent.click(nav.getByRole("button", { name: "Join Room" }));
    expect(screen.getByText("join-dialog")).toBeInTheDocument();
  });

  it("logs out, revoking the session first", async () => {
    renderLayout(<PageLayout>content</PageLayout>, "/settings");

    await userEvent.click(screen.getByRole("button", { name: "Log Out" }));

    await waitFor(() => expect(auth.signOut).toHaveBeenCalledOnce());
    expect(auth.revokeSessions).toHaveBeenCalledOnce();
    expect(screen.getByTestId("path")).toHaveTextContent("/login");
  });

  it("marks the current page, and Search on nested filter routes", () => {
    renderLayout(<PageLayout>content</PageLayout>, "/filters/actors");
    expect(within(mainNav()).getByRole("link", { name: "Search" })).toHaveAttribute("aria-current", "page");
    expect(within(mainNav()).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("shows the route's title as the page heading", () => {
    renderLayout(<PageLayout title="History">content</PageLayout>);
    expect(screen.getByRole("heading", { level: 1, name: "History" })).toBeInTheDocument();
  });

  it("keeps an h1 on a page with no title", () => {
    renderLayout(<PageLayout gradient>content</PageLayout>);
    expect(screen.getByRole("heading", { level: 1, name: "Movie Date" })).toBeInTheDocument();
  });

  it("still gives a bare step no way out but its own buttons", () => {
    renderLayout(<PageLayout bare>content</PageLayout>);
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
  });
});

describe("Going Steady in the sidebar", () => {
  beforeEach(() => {
    fakeViewport(DESKTOP);
  });

  it("links it, active only on the deck and not on the show filters", () => {
    renderLayout(<PageLayout>content</PageLayout>, "/shows/filters");
    expect(within(mainNav()).getByRole("link", { name: "Going Steady" })).toHaveAttribute("href", "/shows");
    expect(within(mainNav()).getByRole("link", { name: "Going Steady" })).not.toHaveAttribute("aria-current");
  });

  it("points Search at the mode's own filters and offers Movies from Going Steady", () => {
    renderLayout(
      <ModeContext.Provider value={modeValue("TV")}>
        <PageLayout>content</PageLayout>
      </ModeContext.Provider>,
      "/shows",
    );
    expect(within(mainNav()).getByRole("link", { name: "Search" })).toHaveAttribute("href", "/shows/filters");
    expect(within(mainNav()).getByRole("link", { name: "Movies" })).toHaveAttribute("href", "/");
    expect(within(mainNav()).getByRole("link", { name: "Going Steady" })).toHaveAttribute("aria-current", "page");
  });
});

describe("skipping the menu", () => {
  it("puts a skip link first, which moves focus to the screen", async () => {
    renderLayout(<PageLayout>content</PageLayout>);
    const skip = screen.getByRole("link", { name: "Skip to content" });
    await userEvent.tab();
    expect(skip).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("has nothing to skip on a bare screen", () => {
    renderLayout(<PageLayout bare>content</PageLayout>);
    expect(screen.queryByRole("link", { name: "Skip to content" })).not.toBeInTheDocument();
  });
});

describe("tablet shell", () => {
  beforeEach(() => {
    fakeViewport(TABLET);
  });

  it("shows the rail, with the rest in the drawer behind More", async () => {
    renderLayout(<PageLayout bottomNav>content</PageLayout>);

    expect(mainNav().className).toContain("rail");
    expect(screen.queryByRole("button", { name: "Open menu" })).not.toBeInTheDocument();
    expect(within(mainNav()).queryByRole("link", { name: "Settings" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "More" }));

    const drawer = screen.getByRole("dialog", { name: "Menu" });
    expect(within(drawer).getByRole("link", { name: "Settings" })).toBeInTheDocument();
    expect(within(drawer).getByRole("button", { name: "Log Out" })).toBeInTheDocument();
  });

  it("keeps More out of the scrolling part, where a short screen would hide it", () => {
    renderLayout(<PageLayout>content</PageLayout>);
    const more = within(mainNav()).getByRole("button", { name: "More" });
    expect(more.closest(".md-side-nav__scroll")).toBeNull();
    expect(mainNav().querySelector(".md-side-nav__scroll")).not.toBeNull();
  });

  it("keeps the full name on the Join button, whose rail label is shortened too", () => {
    renderLayout(<PageLayout>content</PageLayout>);
    expect(within(mainNav()).getByRole("button", { name: "Join Room" })).toHaveTextContent("Join");
  });

  it("keeps the full name on the Going Steady link", () => {
    renderLayout(<PageLayout>content</PageLayout>);
    expect(within(mainNav()).getByRole("link", { name: "Going Steady" })).toHaveTextContent("Shows");
  });

  it("keeps the full name on a link whose rail label is shortened", () => {
    renderLayout(<PageLayout>content</PageLayout>);
    const link = within(mainNav()).getByRole("link", { name: "Room Members" });
    expect(link).toHaveTextContent("Members");
  });
});

describe("mobile shell", () => {
  beforeEach(() => {
    fakeViewport(PHONE);
  });

  it("keeps today's model: app bar, drawer and bottom nav, and no sidebar", async () => {
    renderLayout(
      <PageLayout title="History" bottomNav>
        content
      </PageLayout>,
    );

    expect(screen.getByRole("heading", { level: 1, name: "History" }).closest("header")).toHaveClass("md-app-bar");
    expect(mainNav()).toHaveClass("md-bottom-nav");

    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
  });
});

describe("resizing", () => {
  function Counter({ onMount }: { onMount: () => void }): JSX.Element {
    const [count, setCount] = useState(0);
    useEffect(onMount, [onMount]);
    return <button onClick={() => setCount(count + 1)}>count {count}</button>;
  }

  it("keeps the screen mounted across breakpoints, so a rotation can't lose the deck", async () => {
    const viewport = fakeViewport(PHONE);
    const onMount = vi.fn();
    renderLayout(
      <PageLayout title="History">
        <Counter onMount={onMount} />
      </PageLayout>,
    );
    await userEvent.click(screen.getByRole("button", { name: "count 0" }));

    act(() => viewport.resize(TABLET));
    act(() => viewport.resize(DESKTOP));
    act(() => viewport.resize(PHONE));

    expect(screen.getByRole("button", { name: "count 1" })).toBeInTheDocument();
    expect(onMount).toHaveBeenCalledOnce();
  });

  it("doesn't reopen the drawer when a window narrows again", async () => {
    const viewport = fakeViewport(TABLET);
    renderLayout(<PageLayout>content</PageLayout>);

    await userEvent.click(screen.getByRole("button", { name: "More" }));
    act(() => viewport.resize(DESKTOP));
    act(() => viewport.resize(TABLET));

    expect(screen.queryByRole("dialog", { name: "Menu" })).not.toBeInTheDocument();
  });
});

describe("page actions", () => {
  it("lands in the header from tablet up, and in its own row on a phone", () => {
    const viewport = fakeViewport(DESKTOP);
    renderLayout(
      <PageLayout title="Room Members">
        <PageActions>
          <button>Invite</button>
        </PageActions>
      </PageLayout>,
    );
    const invite = () => screen.getByRole("button", { name: "Invite" });

    expect(invite().parentElement).toHaveClass("md-page-header__actions");

    act(() => viewport.resize(PHONE));
    expect(invite().parentElement).toHaveClass("md-page__actions");
  });

  it("stays in place on a page with no header", () => {
    fakeViewport(DESKTOP);
    renderLayout(
      <PageLayout>
        <PageActions>
          <button>Invite</button>
        </PageActions>
      </PageLayout>,
    );
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("button", { name: "Invite" }));
  });
});

describe("route changes", () => {
  function Links(): JSX.Element {
    const navigate = useNavigate();
    return (
      <>
        <button onClick={() => navigate("/second")}>go</button>
        <button onClick={() => navigate("/?tab=swipes")}>tab</button>
      </>
    );
  }

  function renderRoutes() {
    return renderLayout(
      <Routes>
        <Route element={<PageLayout />}>
          <Route path="/" element={<Links />} />
          <Route path="/second" element={<p>second</p>} />
        </Route>
      </Routes>,
    );
  }

  it("plays the transition on a new path, and starts the new page at the top", () => {
    renderRoutes();
    const main = screen.getByRole("main");
    const firstColumn = main.querySelector(".md-route-transition");
    main.scrollTop = 300;

    fireEvent.click(screen.getByRole("button", { name: "go" }));

    expect(screen.getByText("second")).toBeInTheDocument();
    expect(main.querySelector(".md-route-transition")).not.toBe(firstColumn);
    expect(main.scrollTop).toBe(0);
  });

  it("doesn't replay it for a query change, which would remount the screen", () => {
    renderRoutes();
    const main = screen.getByRole("main");
    const firstColumn = main.querySelector(".md-route-transition");

    fireEvent.click(screen.getByRole("button", { name: "tab" }));

    expect(main.querySelector(".md-route-transition")).toBe(firstColumn);
  });
});
