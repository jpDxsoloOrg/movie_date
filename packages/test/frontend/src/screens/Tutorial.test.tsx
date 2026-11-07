import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModeContext, modeValue } from "../../../../frontend/src/mode/ModeProvider";
import Tutorial from "@movie-date/frontend/screens/Tutorial";
import { hasSeenTutorial, resetTutorialSeen } from "@movie-date/frontend/services/tutorial";
import { fakeViewport } from "../support/viewport";

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

    const dialog = screen.getByRole("dialog", { name: "Tutorial, step 1 of 7" });
    expect(dialog).toHaveFocus();
    expect(screen.getByText(/home icon/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Prev" })).not.toBeInTheDocument();
  });

  it("steps through Join Room, Search, swiping and the room code to Finish", async () => {
    renderTutorial();

    await next();
    expect(screen.getByText(/moves between them/)).toBeInTheDocument();
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

  it("speaks Going Steady from Going Steady, all the way through", async () => {
    render(
      <MemoryRouter
        initialEntries={["/tutorial"]}
        future={{ v7_startTransition: false, v7_relativeSplatPath: true }}
      >
        <ModeContext.Provider value={modeValue("TV")}>
          <Tutorial />
        </ModeContext.Provider>
      </MemoryRouter>,
    );
    expect(screen.getByText("Go Steady")).toBeInTheDocument();
    expect(screen.getByText("Your Next Show (2019–present)")).toBeInTheDocument();
    expect(screen.getByText(/show swipe page/)).toBeInTheDocument();
    await next();
    await next();
    await next();
    expect(screen.getByText(/find shows by/)).toBeInTheDocument();
    await next();
    expect(screen.getByText(/the same show/)).toBeInTheDocument();
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

  it("keeps keyboard talk off a phone", async () => {
    renderTutorial();
    await next();
    await next();
    await next();
    await next();

    expect(screen.queryByText("Backspace")).not.toBeInTheDocument();
  });

  describe("on desktop", () => {
    let viewport: ReturnType<typeof fakeViewport>;

    beforeEach(() => {
      viewport = fakeViewport(1280);
    });

    afterEach(() => {
      vi.useRealTimers();
      viewport.restore();
    });

    const toSwipeStep = async (): Promise<void> => {
      await next();
      await next();
      await next();
      await next();
    };

    const card = (): Element | null => document.querySelector(".tutorial__card");

    it("explains the swipe keys, in the words of what they do", async () => {
      renderTutorial();
      await toSwipeStep();

      const keys = screen.getByLabelText("Keyboard shortcuts");
      expect(keys).toHaveTextContent("←Pass");
      expect(keys).toHaveTextContent("→Like");
      expect(keys).toHaveTextContent("BackspaceUndo");
      expect(screen.queryByText(/Swipe left/)).not.toBeInTheDocument();
    });

    it("shows the keys only on that step, and points at the details beside the deck", async () => {
      renderTutorial();
      expect(screen.queryByText("Backspace")).not.toBeInTheDocument();

      await toSwipeStep();
      await next();

      expect(screen.queryByText("Backspace")).not.toBeInTheDocument();
      expect(screen.getByText(/sit beside the deck/)).toBeInTheDocument();
      expect(screen.queryByText(/Tap on the poster/)).not.toBeInTheDocument();
    });

    it("answers the arrow keys on the card, and Backspace puts it back", async () => {
      renderTutorial();
      await toSwipeStep();

      await userEvent.keyboard("{ArrowRight}");
      expect(card()).toHaveClass("tutorial__card--tried-like");

      await userEvent.keyboard("{ArrowLeft}");
      expect(card()).toHaveClass("tutorial__card--tried-pass");

      await userEvent.keyboard("{Backspace}");
      expect(card()).toHaveClass("tutorial__card--swiping");
    });

    it("settles the card again after a try", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      renderTutorial();
      for (let press = 0; press < 4; press += 1) {
        act(() => screen.getByRole("button", { name: "Next" }).click());
      }

      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
      });
      expect(card()).toHaveClass("tutorial__card--tried-like");

      act(() => {
        vi.advanceTimersByTime(2000);
      });
      expect(card()).toHaveClass("tutorial__card--swiping");
    });

    it("leaves the arrow keys alone on the other steps", async () => {
      renderTutorial();
      await userEvent.keyboard("{ArrowRight}");
      expect(card()).not.toHaveClass("tutorial__card--tried-like");
    });
  });
});
