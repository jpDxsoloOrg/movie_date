import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { useEffect } from "react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANCHOR_WAIT_MS, TourOverlay } from "../../../../../frontend/src/components/tour/TourOverlay";
import { TOUR_STORAGE_KEY, TourProvider, useTour } from "../../../../../frontend/src/components/tour/TourProvider";
import { stepsFor, TOUR_STEPS, tourText, tourTitle } from "../../../../../frontend/src/components/tour/tourSteps";
import { ModeContext, modeValue } from "../../../../../frontend/src/mode/ModeProvider";
import { MODE_COPY } from "../../../../../frontend/src/mode/modeCopy";
import { TUTORIAL_STEPS } from "../../../../../frontend/src/screens/tutorial/steps";
import { hasSeenTutorial, resetTutorialSeen } from "@movie-date/frontend/services/tutorial";
import type { MediaType } from "@movie-date/frontend/services/api";
import { fakeViewport } from "../../support/viewport";

vi.mock("../../../../../frontend/src/screens/tutorial/steps", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../../../../frontend/src/screens/tutorial/steps")>();
  return {
    ...actual,
    tutorialImage: (...args: Parameters<typeof actual.tutorialImageName>) => `/assets/${actual.tutorialImageName(...args)}`,
  };
});

const FRONTEND_SRC = join(__dirname, "../../../../../frontend/src");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(tsx|ts)$/.test(name) ? [full] : [];
  });
}

/** jsdom lays nothing out, so an anchor needs a size to count as on screen. */
function Anchor({ id }: { id: string }): JSX.Element {
  return (
    <div
      data-tour={id}
      ref={(element) => {
        if (element) element.getBoundingClientRect = () => ({ top: 100, left: 40, width: 200, height: 80, right: 240, bottom: 180, x: 40, y: 100, toJSON: () => ({}) });
      }}
    />
  );
}

beforeEach(() => {
  resetTutorialSeen();
  sessionStorage.clear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("tour steps", () => {
  it("cover every screenshot step, once each", () => {
    expect(TOUR_STEPS.map((step) => step.id).sort()).toEqual(TUTORIAL_STEPS.map((step) => step.id).sort());
  });

  it("only point at anchors some component really renders", () => {
    const source = sourceFiles(FRONTEND_SRC)
      .filter((file) => !file.includes(`${join("components", "tour")}`))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    for (const step of TOUR_STEPS) {
      for (const anchor of step.anchors) {
        expect(source, `${step.id} → ${anchor}`).toMatch(new RegExp(`(data-tour|tour)=?:? ?\\{?"${anchor}"`));
      }
    }
  });

  it("leave Install out once the app is installed", () => {
    expect(stepsFor({ installed: false }).map((step) => step.id)).toContain("install");
    expect(stepsFor({ installed: true }).map((step) => step.id)).not.toContain("install");
  });

  it("never name a movie in Going Steady", () => {
    for (const step of TOUR_STEPS) {
      for (const breakpoint of ["mobile", "tablet", "desktop"] as const) {
        expect(`${tourTitle(step, MODE_COPY.TV)} ${tourText(step, MODE_COPY.TV, breakpoint)}`).not.toMatch(/movie(?! date)/);
      }
    }
  });

  it("use the sidebar wording on tablets for navigation, and the touch wording for the deck", () => {
    const join = TOUR_STEPS.find((step) => step.id === "join");
    const deck = TOUR_STEPS.find((step) => step.id === "deck");
    if (!join || !deck) throw new Error("missing steps");
    expect(tourText(join, MODE_COPY.MOVIE, "tablet")).toMatch(/sidebar/);
    expect(tourText(join, MODE_COPY.MOVIE, "mobile")).toMatch(/at the bottom/);
    expect(tourText(deck, MODE_COPY.MOVIE, "tablet")).toMatch(/^Swipe right/);
  });
});

function renderOverlay(stepId: string, handlers: { onNext?: () => void; onPrev?: () => void; onSkip?: () => void } = {}) {
  const step = TOUR_STEPS.find((candidate) => candidate.id === stepId);
  if (!step) throw new Error(stepId);
  const props = { onNext: vi.fn(), onSkip: vi.fn(), ...handlers };
  render(
    <MemoryRouter future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
      <ModeContext.Provider value={modeValue("MOVIE")}>
        <Anchor id="deck" />
        <TourOverlay step={step} stepNumber={2} total={12} title="Title" text="Words" {...props} />
      </ModeContext.Provider>
    </MemoryRouter>,
  );
  return props;
}

describe("TourOverlay", () => {
  it("rings the step's element and labels the card with the step", async () => {
    renderOverlay("deck");
    expect(screen.getByRole("dialog", { name: "Tour, step 2 of 12" })).toHaveAccessibleDescription(/Words/);
    await screen.findByText("Words");
    await vi.waitFor(() => expect(document.querySelector(".tour__ring")).not.toBeNull());
    expect(document.querySelector(".tour__scrim")).toBeNull();
  });

  it("shows the step's screenshot in the middle when its element never appears", () => {
    vi.useFakeTimers();
    renderOverlay("members");
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(ANCHOR_WAIT_MS + 200));
    expect(document.querySelector(".tour__card--center")).not.toBeNull();
    expect(document.querySelector(".tour__scrim")).not.toBeNull();
    expect(screen.getByRole("img")).toHaveAttribute("src", "/assets/tutorial-movies-members-phone.webp");
  });

  it("Skip, Escape, Prev and Next do what they say", async () => {
    const props = renderOverlay("deck", { onPrev: vi.fn() });
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(props.onNext).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Prev" }));
    expect(props.onPrev).toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(props.onSkip).toHaveBeenCalledTimes(2);
  });

  it("shows the arrow keys on the deck step, on desktop only", () => {
    fakeViewport(1280);
    renderOverlay("deck");
    expect(screen.getByLabelText("Keyboard shortcuts")).toHaveTextContent("←Pass");
  });

  it("keeps keyboard talk off a phone", () => {
    renderOverlay("deck");
    expect(screen.queryByLabelText("Keyboard shortcuts")).not.toBeInTheDocument();
  });
});

function Starter({ from }: { from: string }): null {
  const { start, active } = useTour();
  useEffect(() => {
    if (!active && !hasSeenTutorial()) start(from);
  }, [active, start, from]);
  return null;
}

function Path(): JSX.Element {
  return <div data-testid="path">{useLocation().pathname}</div>;
}

function renderProvider({ mode = "MOVIE" as MediaType, at = "/join/ABC234" } = {}): void {
  render(
    <MemoryRouter initialEntries={[at]} future={{ v7_startTransition: false, v7_relativeSplatPath: true }}>
      <ModeContext.Provider value={modeValue(mode)}>
        <TourProvider>
          <Starter from={at} />
          <Path />
        </TourProvider>
      </ModeContext.Provider>
    </MemoryRouter>,
  );
}

const path = (): string | null => screen.getByTestId("path").textContent;

describe("TourProvider", () => {
  it("moves to each step's screen, and Finish returns to where the tour began", async () => {
    renderProvider();
    await screen.findByRole("dialog", { name: /^Tour, step 1 of/ });
    expect(path()).toBe("/");
    const total = stepsFor({ installed: false }).length;
    const seen: string[] = [];
    for (let step = 1; step < total; step += 1) {
      await userEvent.click(screen.getByRole("button", { name: "Next" }));
      await screen.findByRole("dialog", { name: `Tour, step ${step + 1} of ${total}` });
      seen.push(path() ?? "");
    }
    expect(seen).toEqual(expect.arrayContaining(["/members", "/settings", "/history", "/profile", "/install"]));
    await userEvent.click(screen.getByRole("button", { name: "Finish" }));
    expect(path()).toBe("/join/ABC234");
    expect(hasSeenTutorial()).toBe(true);
    expect(sessionStorage.getItem(TOUR_STORAGE_KEY)).toBeNull();
  });

  it("takes Going Steady to its own deck", async () => {
    renderProvider({ mode: "TV" });
    await screen.findByRole("dialog", { name: /^Tour, step 1 of/ });
    expect(path()).toBe("/shows");
  });

  it("picks up where it was after a reload", async () => {
    sessionStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ index: 7, returnTo: "/" }));
    renderProvider({ at: "/" });
    await screen.findByRole("dialog", { name: /^Tour, step 8 of/ });
    expect(path()).toBe("/members");
  });

  it("ignores stored progress that points off the site", async () => {
    sessionStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify({ index: 2, returnTo: "https://evil.example" }));
    resetTutorialSeen();
    renderProvider({ at: "/" });
    await screen.findByRole("dialog", { name: /^Tour, step 1 of/ });
  });
});
