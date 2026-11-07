import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";
import Tutorial from "@movie-date/frontend/screens/Tutorial";
import { hasSeenTutorial, resetTutorialSeen } from "@movie-date/frontend/services/tutorial";

function Path(): JSX.Element {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderTutorial(from?: string): void {
  render(
    <MemoryRouter
      initialEntries={[{ pathname: "/tutorial", state: from ? { from } : null }]}
      future={{ v7_startTransition: false, v7_relativeSplatPath: true }}
    >
      <Tutorial />
      <Path />
    </MemoryRouter>,
  );
}

const next = async (): Promise<void> => userEvent.click(screen.getByRole("button", { name: "Next" }));

beforeEach(() => resetTutorialSeen());

describe("Tutorial", () => {
  it("opens as a dialog on the first step, with focus inside", () => {
    renderTutorial();

    const dialog = screen.getByRole("dialog", { name: "Tutorial, step 1 of 6" });
    expect(dialog).toHaveFocus();
    expect(screen.getByText(/home icon/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prev" })).not.toBeInTheDocument();
  });

  it("steps through Join Room, Search, swiping and the room code to Finish", async () => {
    renderTutorial();

    await next();
    expect(screen.getByText(/Press Join Room/)).toBeInTheDocument();
    await next();
    expect(screen.getByText(/Press Search/)).toBeInTheDocument();
    await next();
    expect(screen.getByText(/Swipe left/)).toBeInTheDocument();
    await next();
    expect(screen.getByText(/Tap on the poster/)).toBeInTheDocument();
    await next();
    expect(screen.getByText(/share this room code/)).toBeInTheDocument();

    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip" })).not.toBeInTheDocument();
    expect(hasSeenTutorial()).toBe(false);

    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(hasSeenTutorial()).toBe(true);
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
  });

  it("goes back a step, keeping focus in the dialog when Prev disappears", async () => {
    renderTutorial();
    await next();

    await userEvent.click(screen.getByRole("button", { name: "Prev" }));

    expect(screen.getByText(/home icon/)).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it("skips from any step and counts as seen", async () => {
    renderTutorial();
    await next();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(hasSeenTutorial()).toBe(true);
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
  });

  it("Escape skips", async () => {
    renderTutorial();
    await userEvent.keyboard("{Escape}");
    expect(hasSeenTutorial()).toBe(true);
  });

  it("returns an invite link visitor to their invite", async () => {
    renderTutorial("/join/ABC234");
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(screen.getByTestId("path")).toHaveTextContent("/join/ABC234");
  });
});
