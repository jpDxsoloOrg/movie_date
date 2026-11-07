import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ signOut: vi.fn() }));
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
import { useToast } from "@movie-date/frontend/hooks/useToast";

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

describe("Drawer", () => {
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

    expect(auth.signOut).toHaveBeenCalledOnce();
    expect(screen.getByTestId("path")).toHaveTextContent("/login");
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
