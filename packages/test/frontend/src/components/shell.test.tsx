import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signOut: vi.fn(), revokeSessions: vi.fn(async () => undefined) }));
vi.mock("@movie-date/frontend/services/auth", () => auth);
vi.mock("@movie-date/frontend/components/JoinRoomDialog", () => ({
  default: ({ open }: { open: boolean }) => (open ? <p>join-dialog</p> : null),
}));

import { AppBar } from "@movie-date/frontend/components/AppBar";
import { BottomNav } from "@movie-date/frontend/components/BottomNav";
import { BottomSheet } from "@movie-date/frontend/components/BottomSheet";
import { Button } from "@movie-date/frontend/components/Button";
import { Drawer } from "@movie-date/frontend/components/Drawer";
import { Modal } from "@movie-date/frontend/components/Modal";
import { PageLayout } from "@movie-date/frontend/components/PageLayout";
import { EmptyState, ErrorState } from "@movie-date/frontend/components/StateMessage";
import { TextField } from "@movie-date/frontend/components/TextField";
import { ToastProvider } from "@movie-date/frontend/context/ToastProvider";
import { useFocusTrap } from "@movie-date/frontend/hooks/useFocusTrap";
import { useToast } from "@movie-date/frontend/hooks/useToast";
import { ModeContext, modeValue } from "@movie-date/frontend/mode/ModeProvider";

function Path(): JSX.Element {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function inRouter(ui: JSX.Element, path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]} future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
      {ui}
      <Path />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe("AppBar", () => {
  it("defaults to the app title and opens the menu", async () => {
    const onOpenMenu = vi.fn();
    render(<AppBar onOpenMenu={onOpenMenu} />);

    expect(screen.getByRole("heading", { name: "Movie Date" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));
    expect(onOpenMenu).toHaveBeenCalledOnce();
  });
});

describe("in Going Steady", () => {
  const inShows = (ui: JSX.Element, path = "/shows") =>
    inRouter(<ModeContext.Provider value={modeValue("TV")}>{ui}</ModeContext.Provider>, path);

  it("titles the app bar for the mode, and leaves a route's own title alone", () => {
    const first = inShows(<AppBar onOpenMenu={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Going Steady" })).toBeInTheDocument();
    first.unmount();

    inShows(<AppBar title="History" onOpenMenu={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
  });

  it("keeps the bottom nav in the mode", () => {
    inShows(<BottomNav />);
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/shows");
    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/shows/filters");
  });

  it("marks Search active on the nested show filter route", () => {
    inShows(<BottomNav />, "/shows/filters/actors");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("aria-current", "page");
  });

  it("offers Movies in the drawer, beside the current Going Steady", () => {
    inShows(<Drawer open onClose={vi.fn()} />);
    const drawer = screen.getByRole("dialog", { name: "Menu" });

    expect(within(drawer).getByRole("link", { name: "Movies" })).toHaveAttribute("href", "/");
    expect(within(drawer).getByRole("link", { name: "Going Steady" })).toHaveAttribute("aria-current", "page");
    expect(within(drawer).queryByRole("link", { name: "Home" })).not.toBeInTheDocument();
  });
});

describe("Drawer", () => {
  it("links Going Steady", () => {
    inRouter(<Drawer open onClose={vi.fn()} />);
    expect(screen.getByRole("link", { name: "Going Steady" })).toHaveAttribute("href", "/shows");
  });

  it("has every spec entry, the version and the TMDB attribution", () => {
    inRouter(<Drawer open onClose={vi.fn()} />);
    const drawer = screen.getByRole("dialog", { name: "Menu" });

    expect(within(drawer).getByRole("button", { name: "Log Out" })).toBeInTheDocument();
    for (const [name, href] of [
      ["Home", "/"],
      ["Profile", "/profile"],
      ["Room Members", "/members"],
      ["History", "/history"],
      ["Tutorial", "/tutorial"],
      ["Settings", "/settings"],
    ] as const) {
      expect(within(drawer).getByRole("link", { name })).toHaveAttribute("href", href);
    }
    expect(within(drawer).getByText(/^Version v/)).toBeInTheDocument();
    expect(
      within(drawer).getByText("This product uses the TMDB API but is not endorsed or certified by TMDB"),
    ).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    inRouter(<Drawer open={false} onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("closes on navigation", async () => {
    const onClose = vi.fn();
    inRouter(<Drawer open onClose={onClose} />);

    await userEvent.click(screen.getByRole("link", { name: "History" }));

    expect(onClose).toHaveBeenCalled();
    expect(screen.getByTestId("path")).toHaveTextContent("/history");
  });

  it("logs out and goes to login", async () => {
    inRouter(<Drawer open onClose={vi.fn()} />, "/settings");

    await userEvent.click(screen.getByRole("button", { name: "Log Out" }));

    await waitFor(() => expect(auth.signOut).toHaveBeenCalledOnce());
    expect(screen.getByTestId("path")).toHaveTextContent("/login");
  });

  it("revokes the session first, while the tokens that need are still there", async () => {
    inRouter(<Drawer open onClose={vi.fn()} />, "/settings");

    await userEvent.click(screen.getByRole("button", { name: "Log Out" }));

    await waitFor(() => expect(auth.signOut).toHaveBeenCalled());
    expect(auth.revokeSessions.mock.invocationCallOrder[0]).toBeLessThan(
      auth.signOut.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("closes on Escape and returns focus to the opener", async () => {
    function Harness(): JSX.Element {
      const [open, setOpen] = useState(false);
      return (
        <>
          <button onClick={() => setOpen(true)}>open</button>
          <Drawer open={open} onClose={() => setOpen(false)} />
        </>
      );
    }
    inRouter(<Harness />);
    const user = userEvent.setup();
    const opener = screen.getByRole("button", { name: "open" });

    await user.click(opener);
    expect(screen.getByRole("dialog")).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });
});

describe("BottomNav", () => {
  it("links Home and Search, and Join Room opens the dialog in place", async () => {
    inRouter(<BottomNav />);

    expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("href", "/filters");

    await userEvent.click(screen.getByRole("button", { name: "Join Room" }));

    expect(screen.getByText("join-dialog")).toBeInTheDocument();
    expect(screen.getByTestId("path")).toHaveTextContent("/");
  });

  it("marks Search active on nested filter routes", () => {
    inRouter(<BottomNav />, "/filters/actors");
    expect(screen.getByRole("link", { name: "Search" })).toHaveAttribute("aria-current", "page");
  });
});

describe("PageLayout", () => {
  it("renders the route's outlet with the gradient", () => {
    const { container } = inRouter(
      <Routes>
        <Route element={<PageLayout gradient />}>
          <Route path="/" element={<p>content</p>} />
        </Route>
      </Routes>,
    );
    expect(screen.getByRole("main")).toHaveTextContent("content");
    expect(container.querySelector(".md-page--gradient")).not.toBeNull();
  });

  it("has no bars or menu in bare mode, so the screen's own buttons are the only exits", () => {
    inRouter(
      <PageLayout bare bottomNav>
        content
      </PageLayout>,
    );
    expect(screen.getByRole("main")).toHaveTextContent("content");
    expect(screen.queryByRole("button", { name: "Open menu" })).not.toBeInTheDocument();
  });

  it("opens the drawer from the app bar", async () => {
    inRouter(<PageLayout title="History">content</PageLayout>);

    expect(screen.getByRole("heading", { name: "History" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Open menu" }));

    expect(screen.getByRole("dialog", { name: "Menu" })).toBeInTheDocument();
  });
});

describe("Modal", () => {
  it("is labelled by its title and closes on Escape and backdrop, not panel clicks", async () => {
    const onClose = vi.fn();
    render(
      <Modal open onClose={onClose} title="Join Room" actions={<button>ok</button>}>
        body
      </Modal>,
    );
    const user = userEvent.setup();
    const dialog = screen.getByRole("dialog", { name: "Join Room" });

    await user.click(dialog);
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();

    await user.click(dialog.parentElement as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("keeps Tab inside", async () => {
    render(
      <Modal
        open
        onClose={vi.fn()}
        title="t"
        actions={
          <>
            <button>first</button>
            <button>last</button>
          </>
        }
      >
        body
      </Modal>,
    );
    const user = userEvent.setup();
    const last = screen.getByRole("button", { name: "last" });

    last.focus();
    await user.tab();
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus();

    await user.tab({ shift: true });
    expect(last).toHaveFocus();
  });
});

describe("BottomSheet", () => {
  it("has a labelled close button", async () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open onClose={onClose} label="Movie details">
        body
      </BottomSheet>,
    );

    expect(screen.getByRole("dialog", { name: "Movie details" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("renders nothing when closed", () => {
    render(
      <BottomSheet open={false} onClose={vi.fn()} label="x">
        body
      </BottomSheet>,
    );
    expect(screen.queryByText("body")).not.toBeInTheDocument();
  });
});

describe("BottomSheet gestures", () => {
  /** jsdom has no PointerEvent, and without one fireEvent drops the coordinates. */
  class FakePointerEvent extends MouseEvent {
    readonly pointerId: number;

    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 0;
    }
  }

  beforeEach(() => {
    vi.stubGlobal("PointerEvent", FakePointerEvent);
    window.PointerEvent = FakePointerEvent as unknown as typeof PointerEvent;
    HTMLElement.prototype.setPointerCapture = vi.fn();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function renderSheet(onClose: () => void) {
    render(
      <BottomSheet open onClose={onClose} label="Movie details">
        <button>inside</button>
      </BottomSheet>,
    );
    const panel = screen.getByRole("dialog", { name: "Movie details" });
    const backdrop = panel.parentElement as HTMLElement;
    const header = panel.querySelector(".md-sheet__header") as HTMLElement;
    vi.spyOn(panel, "getBoundingClientRect").mockReturnValue({ height: 500 } as DOMRect);
    return { panel, backdrop, header };
  }

  it("ignores a click whose press began elsewhere, like the tap that opened it", () => {
    const onClose = vi.fn();
    const { backdrop } = renderSheet(onClose);
    fireEvent.click(backdrop);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("closes on a real tap on the backdrop", () => {
    const onClose = vi.fn();
    const { backdrop } = renderSheet(onClose);
    fireEvent.pointerDown(backdrop);
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("closes when the handle is dragged far enough", () => {
    const onClose = vi.fn();
    const { header } = renderSheet(onClose);
    fireEvent.pointerDown(header, { pointerId: 1, button: 0, clientY: 0 });
    fireEvent.pointerMove(header, { pointerId: 1, clientY: 200 });
    fireEvent.pointerUp(header, { pointerId: 1, clientY: 200 });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("follows the finger, and doesn't go above where it started", () => {
    const { header, panel } = renderSheet(vi.fn());
    fireEvent.pointerDown(header, { pointerId: 1, button: 0, clientY: 100 });
    fireEvent.pointerMove(header, { pointerId: 1, clientY: 140 });
    expect(panel.style.transform).toBe("translateY(40px)");
    fireEvent.pointerMove(header, { pointerId: 1, clientY: 50 });
    expect(panel.style.transform).toBe("translateY(0px)");
  });

  it("leaves a press on Close to the button", () => {
    const onClose = vi.fn();
    const { header } = renderSheet(onClose);
    const close = within(header).getByRole("button", { name: "Close" });
    fireEvent.pointerDown(close, { pointerId: 1, button: 0, clientY: 0 });
    fireEvent.pointerUp(close, { pointerId: 1, clientY: 0 });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(close);
    expect(onClose).toHaveBeenCalledOnce();
  });
});

describe("focus containment behind a dialog", () => {
  function Harness(): JSX.Element {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>open</button>
        <BottomSheet open={open} onClose={() => setOpen(false)} label="Sheet">
          <iframe title="player" />
        </BottomSheet>
      </>
    );
  }

  function renderInRoot() {
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
    render(<Harness />, { container: root });
    return root;
  }

  afterEach(() => {
    document.getElementById("root")?.remove();
  });

  it("makes the page inert while open and gives focus back after", async () => {
    const root = renderInRoot();
    const opener = screen.getByRole("button", { name: "open" });
    await userEvent.click(opener);
    expect(root).toHaveAttribute("inert");

    fireEvent.keyDown(screen.getByRole("dialog", { name: "Sheet" }), { key: "Escape" });
    expect(root).not.toHaveAttribute("inert");
    expect(opener).toHaveFocus();
  });

  it("leaves #root alone for a dialog inside it, like the Tutorial", () => {
    function InPlace(): JSX.Element {
      const trap = useFocusTrap<HTMLDivElement>(true, vi.fn());
      return <div ref={trap.ref} tabIndex={-1} />;
    }
    const root = document.createElement("div");
    root.id = "root";
    document.body.append(root);
    render(<InPlace />, { container: root });
    expect(root).not.toHaveAttribute("inert");
  });

  it("stays inert until the last of two dialogs has closed", async () => {
    const root = renderInRoot();
    const second = render(
      <Modal open onClose={vi.fn()} title="Second">
        <p>body</p>
      </Modal>,
    );
    await userEvent.click(screen.getByRole("button", { name: "open", hidden: true }));
    fireEvent.keyDown(screen.getByRole("dialog", { name: "Sheet", hidden: true }), { key: "Escape" });
    expect(root).toHaveAttribute("inert");
    second.unmount();
    expect(root).not.toHaveAttribute("inert");
  });

  it("sends Tab coming out of the iframe to Close, and Shift+Tab from Close to the iframe", async () => {
    renderInRoot();
    await userEvent.click(screen.getByRole("button", { name: "open" }));
    const dialog = screen.getByRole("dialog", { name: "Sheet" });
    const close = within(dialog).getByRole("button", { name: "Close" });

    const sentinel = dialog.querySelector<HTMLElement>("[data-focus-sentinel]");
    sentinel?.focus();
    expect(close).toHaveFocus();

    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(within(dialog).getByTitle("player")).toHaveFocus();
  });
});

describe("Button", () => {
  it("defaults to type=button and blocks clicks while loading", async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Save
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Save" });

    expect(button).toHaveAttribute("type", "button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
  });
});

describe("TextField", () => {
  it("ties the error to the input", () => {
    render(<TextField label="EMAIL" error="Required" />);
    const input = screen.getByLabelText("EMAIL");

    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(input).toHaveAccessibleDescription("Required");
  });

  it("toggles password visibility", async () => {
    render(<TextField label="PASSWORD" type="password" />);
    const input = screen.getByLabelText("PASSWORD");
    expect(input).toHaveAttribute("type", "password");

    await userEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input).toHaveAttribute("type", "text");

    await userEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(input).toHaveAttribute("type", "password");
  });
});

describe("state messages", () => {
  it("ErrorState offers a retry", async () => {
    const onRetry = vi.fn();
    render(<ErrorState message="Couldn't load." onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent("Couldn't load.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });

  it("EmptyState shows its action", () => {
    render(<EmptyState title="Nothing here" action={<button>Go</button>} />);
    expect(screen.getByRole("heading", { name: "Nothing here" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Go" })).toBeInTheDocument();
  });
});

describe("toasts", () => {
  function Trigger({ message = "Saved" }: { message?: string }): JSX.Element {
    const toast = useToast();
    return <button onClick={() => toast.success(message)}>go</button>;
  }

  afterEach(() => vi.useRealTimers());

  it("announces, then dismisses itself", () => {
    vi.useFakeTimers();
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );

    act(() => screen.getByRole("button", { name: "go" }).click());
    expect(screen.getByRole("status")).toHaveTextContent("Saved");

    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("doesn't stack a repeat", () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    const button = screen.getByRole("button", { name: "go" });

    act(() => button.click());
    act(() => button.click());

    expect(screen.getAllByText("Saved")).toHaveLength(1);
  });

  it("dismisses on tap", async () => {
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await userEvent.click(screen.getByRole("button", { name: "go" }));
    await userEvent.click(screen.getByRole("button", { name: "Saved" }));
    expect(screen.queryByText("Saved")).not.toBeInTheDocument();
  });

  it("useToast throws outside the provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<Trigger />)).toThrow("useToast must be used inside ToastProvider");
    vi.restoreAllMocks();
  });
});
