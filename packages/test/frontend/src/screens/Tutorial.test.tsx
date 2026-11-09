import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModeContext, modeValue } from "../../../../frontend/src/mode/ModeProvider";
import { MODE_COPY } from "../../../../frontend/src/mode/modeCopy";
import { TUTORIAL_STEPS } from "../../../../frontend/src/screens/tutorial/steps";
import type { MediaType } from "@movie-date/frontend/services/api";
import Tutorial from "@movie-date/frontend/screens/Tutorial";
import { hasSeenTutorial, resetTutorialSeen } from "@movie-date/frontend/services/tutorial";
import { fakeViewport } from "../support/viewport";

// The screen's tests shouldn't depend on the screenshots being in the checkout; whether
// they are is tutorialSteps.test.ts's job. The file name logic stays the real one.
vi.mock("../../../../frontend/src/screens/tutorial/steps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../frontend/src/screens/tutorial/steps")>();
  return {
    ...actual,
    tutorialImage: (...args: Parameters<typeof actual.tutorialImageName>) =>
      `/assets/${actual.tutorialImageName(...args)}`,
  };
});

function Path(): JSX.Element {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderTutorial({ from, mode = "MOVIE" }: { from?: string; mode?: MediaType } = {}): void {
  render(
    <MemoryRouter
      initialEntries={[{ pathname: "/tutorial", state: from ? { from } : null }]}
      future={{ v7_startTransition: false, v7_relativeSplatPath: true }}
    >
      <ModeContext.Provider value={modeValue(mode)}>
        <Tutorial />
      </ModeContext.Provider>
      <Path />
    </MemoryRouter>,
  );
}

const next = async (): Promise<void> => userEvent.click(screen.getByRole("button", { name: "Next" }));
const toStep = async (number: number): Promise<void> => {
  for (let step = 1; step < number; step += 1) await next();
};
const stepTitle = (): string => screen.getByRole("heading", { level: 2 }).textContent ?? "";
const shot = (): HTMLImageElement => screen.getByRole("img") as HTMLImageElement;
const STEP_COUNT = TUTORIAL_STEPS.length;
const MODE_STEP = TUTORIAL_STEPS.findIndex(({ id }) => id === "mode") + 1;

beforeEach(() => resetTutorialSeen());

describe("Tutorial", () => {
  it("opens as a dialog on step 1 of 12, with focus inside", () => {
    renderTutorial();

    const dialog = screen.getByRole("dialog", { name: "Tutorial, step 1 of 12" });
    expect(dialog).toHaveFocus();
    expect(stepTitle()).toBe("Swipe to vote");
    expect(screen.queryByRole("button", { name: "Prev" })).not.toBeInTheDocument();
  });

  it("walks every step in order, to Finish", async () => {
    renderTutorial();
    const titles = TUTORIAL_STEPS.map((step) => step.title(MODE_COPY.MOVIE));
    expect(titles).toEqual([
      "Swipe to vote",
      "See the details",
      "Choose what's in the deck",
      "Match Found",
      "Invite your people",
      "Join a room",
      "Who's in the room",
      "Set the match rules",
      "Look back",
      "Going Steady, for shows",
      "Plex, if you have it",
      "Keep it on your home screen",
    ]);

    for (const [index, title] of titles.entries()) {
      expect(screen.getByRole("dialog", { name: `Tutorial, step ${index + 1} of 12` })).toBeInTheDocument();
      expect(stepTitle()).toBe(title);
      if (index < titles.length - 1) await next();
    }

    expect(screen.queryByRole("button", { name: "Next" })).not.toBeInTheDocument();
    expect(hasSeenTutorial()).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(hasSeenTutorial()).toBe(true);
    expect(screen.getByTestId("path")).toHaveTextContent(/^\/$/);
  });

  it("goes back a step, keeping focus in the dialog when Prev disappears", async () => {
    renderTutorial();
    await next();

    await userEvent.click(screen.getByRole("button", { name: "Prev" }));

    expect(stepTitle()).toBe("Swipe to vote");
    expect(screen.getByRole("dialog")).toHaveFocus();
  });

  it.each(Array.from({ length: STEP_COUNT }, (_, index) => index + 1))(
    "skips from step %i and counts as seen",
    async (number) => {
      renderTutorial({ from: "/history" });
      await toStep(number);

      await userEvent.click(screen.getByRole("button", { name: "Skip" }));

      expect(hasSeenTutorial()).toBe(true);
      expect(screen.getByTestId("path")).toHaveTextContent("/history");
    },
  );

  it("Escape skips", async () => {
    renderTutorial();
    await userEvent.keyboard("{Escape}");
    expect(hasSeenTutorial()).toBe(true);
  });

  it("returns an invite link visitor to their invite", async () => {
    renderTutorial({ from: "/join/ABC234" });
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(screen.getByTestId("path")).toHaveTextContent("/join/ABC234");
  });

  it("shows phone shots on a phone, and keeps keyboard talk off it", async () => {
    renderTutorial();

    for (const step of TUTORIAL_STEPS) {
      expect(shot().src).toMatch(/-phone\.webp$/);
      expect(shot()).toHaveAttribute("width", "780");
      expect(shot()).toHaveAttribute("height", "1688");
      expect(shot()).toHaveAttribute("alt", step.alt(MODE_COPY.MOVIE, "phone"));
      expect(screen.queryByLabelText("Keyboard shortcuts")).not.toBeInTheDocument();
      expect(screen.getByRole("dialog")).not.toHaveTextContent(/Backspace|←|→/);
      if (step !== TUTORIAL_STEPS.at(-1)) await next();
    }
  });

  it("speaks Going Steady from Going Steady, with its own shots, all the way through", async () => {
    renderTutorial({ mode: "TV" });

    expect(screen.getByRole("dialog")).toHaveTextContent(/Go Steady and Just Friends buttons/);
    for (const step of TUTORIAL_STEPS) {
      // Lower case: "Movies", the mode's name, and "Movie Date", the app's, are allowed.
      expect(screen.getByRole("dialog")).not.toHaveTextContent(/movie/);
      expect(shot().alt).not.toMatch(/movie/);
      expect(shot().src).toContain(step.id === "mode" ? "tutorial-movies-deck-" : `tutorial-shows-${step.id}-`);
      if (step !== TUTORIAL_STEPS.at(-1)) await next();
    }
  });

  it("shows the other theme's deck on the mode step", async () => {
    renderTutorial();
    await toStep(MODE_STEP);

    expect(stepTitle()).toBe("Going Steady, for shows");
    expect(shot().src).toMatch(/\/tutorial-shows-deck-phone\.webp$/);
  });

  it("shows a placeholder when a shot won't load, and still moves on", async () => {
    renderTutorial();

    fireEvent.error(shot());

    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(document.querySelector(".tutorial__placeholder")).toHaveTextContent("Swipe to vote");
    await next();
    expect(stepTitle()).toBe("See the details");
    expect(shot().src).toMatch(/tutorial-movies-details-phone\.webp$/);
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(hasSeenTutorial()).toBe(true);
  });

  it("preloads only the next step's shot", async () => {
    const created: HTMLImageElement[] = [];
    const RealImage = window.Image;
    vi.stubGlobal(
      "Image",
      class extends RealImage {
        constructor() {
          super();
          created.push(this);
        }
      },
    );
    try {
      renderTutorial();
      expect(created.map((image) => image.src)).toEqual([
        expect.stringMatching(/tutorial-movies-details-phone\.webp$/),
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe("on desktop", () => {
    let viewport: ReturnType<typeof fakeViewport>;

    beforeEach(() => {
      viewport = fakeViewport(1280);
    });

    afterEach(() => viewport.restore());

    it("shows desktop shots, and the keys on the deck step only", async () => {
      renderTutorial();

      expect(shot().src).toMatch(/tutorial-movies-deck-desktop\.webp$/);
      expect(shot()).toHaveAttribute("width", "1280");
      expect(shot()).toHaveAttribute("height", "800");
      const keys = screen.getByLabelText("Keyboard shortcuts");
      expect(keys).toHaveTextContent("←Pass");
      expect(keys).toHaveTextContent("→Like");
      expect(keys).toHaveTextContent("BackspaceUndo");
      expect(screen.queryByText(/Swipe right/)).not.toBeInTheDocument();

      for (let step = 2; step <= STEP_COUNT; step += 1) {
        await next();
        expect(shot().src).toMatch(/-desktop\.webp$/);
        expect(screen.queryByLabelText("Keyboard shortcuts")).not.toBeInTheDocument();
      }
    });

    it("points at the sidebar and beside the deck instead of tapping", async () => {
      renderTutorial();
      await next();

      expect(screen.getByText(/sit beside the deck/)).toBeInTheDocument();
      expect(screen.queryByText(/Tap the poster/)).not.toBeInTheDocument();
    });

    it("speaks Going Steady's keys in Going Steady", () => {
      renderTutorial({ mode: "TV" });

      const keys = screen.getByLabelText("Keyboard shortcuts");
      expect(keys).toHaveTextContent("←Just Friends");
      expect(keys).toHaveTextContent("→Go Steady");
      expect(shot().src).toMatch(/tutorial-shows-deck-desktop\.webp$/);
    });
  });
});
