/**
 * The live tour's steps. Each one opens a real screen and points at a real element,
 * marked with `data-tour="<anchor>"`, so it can't go stale the way a screenshot does.
 *
 * Wording comes from the screenshot tutorial's steps (screens/tutorial/steps.ts), so the
 * two never drift apart and Going Steady never names a movie. Where a new user's screen
 * would be empty (no match yet, no history), the card carries that step's screenshot.
 */
import type { Breakpoint } from "../../hooks/useBreakpoint";
import { type ModeCopy } from "../../mode/modeCopy";
import { homePath } from "../../mode/modeRoutes";
import { TUTORIAL_STEPS, type TutorialStep, type TutorialStepId } from "../../screens/tutorial/steps";
import type { MediaType } from "../../services/api";

export interface TourStep {
  id: TutorialStepId;
  route: (mode: MediaType) => string;
  /** `data-tour` values, in order of preference. The first one on screen is the one shown. */
  anchors: readonly string[];
  /** Shows the step's screenshot in the card, for what a new user's screen can't show yet. */
  inset?: (breakpoint: Breakpoint) => boolean;
  /**
   * Whether the sidebar wording applies. Tablets have the side rail and the room panel,
   * so anything about navigation or the room code reads as it does on desktop.
   */
  sidebarWording?: boolean;
  /** Replaces the screenshot tutorial's text, where the live screen differs from the picture. */
  text?: (copy: ModeCopy, breakpoint: Breakpoint) => string;
  /** Leaves the step out, for example Install once the app is installed. */
  skip?: (state: TourState) => boolean;
}

export interface TourState {
  installed: boolean;
}

const home = (mode: MediaType): string => homePath(mode);
const fixed = (path: string) => (): string => path;
const always = (): boolean => true;
const belowDesktop = (breakpoint: Breakpoint): boolean => breakpoint !== "desktop";

export const TOUR_STEPS: readonly TourStep[] = [
  { id: "deck", route: home, anchors: ["deck"] },
  // The details sheet only opens on a tap, so phones and tablets see it as a picture.
  { id: "details", route: home, anchors: ["details", "deck"], inset: belowDesktop },
  { id: "mode", route: home, anchors: ["mode-switch"] },
  { id: "filters", route: home, anchors: ["nav-search"], inset: always, sidebarWording: true },
  {
    id: "match",
    route: home,
    anchors: ["deck-buttons", "deck"],
    inset: always,
    text: ({ noun, backToStart }) =>
      `When enough of your room says yes to the same ${noun.one}, it's a match, and everyone sees it like this, with where to watch. ${backToStart} starts a fresh deck.`,
  },
  { id: "invite", route: home, anchors: ["room-code"], sidebarWording: true },
  { id: "join", route: home, anchors: ["nav-join"], sidebarWording: true },
  { id: "members", route: fixed("/members"), anchors: ["members-list"] },
  { id: "settings", route: fixed("/settings"), anchors: ["match-rules"] },
  { id: "history", route: fixed("/history"), anchors: ["history-tabs"], inset: always },
  { id: "plex", route: fixed("/profile"), anchors: ["plex-link"] },
  {
    id: "install",
    route: fixed("/install"),
    anchors: ["install"],
    sidebarWording: true,
    text: (_copy, breakpoint) =>
      breakpoint === "mobile"
        ? "Here's how to put Movie Date on your home screen, so it opens like any other app. Install App in the menu brings you back here."
        : "Here's how to keep Movie Date in its own window, a click away. Install App in the sidebar brings you back here.",
    skip: ({ installed }) => installed,
  },
];

const BY_ID = new Map<TutorialStepId, TutorialStep>(TUTORIAL_STEPS.map((step) => [step.id, step]));

/** The screenshot tutorial's entry for a tour step: its title, wording and alt text. */
export function tutorialStepFor(id: TutorialStepId): TutorialStep {
  const step = BY_ID.get(id);
  if (!step) throw new Error(`No tutorial step "${id}"`);
  return step;
}

export function tourTitle(step: TourStep, copy: ModeCopy): string {
  return tutorialStepFor(step.id).title(copy);
}

export function tourText(step: TourStep, copy: ModeCopy, breakpoint: Breakpoint): string {
  if (step.text) return step.text(copy, breakpoint);
  const base = tutorialStepFor(step.id);
  const sidebar = breakpoint === "desktop" || (step.sidebarWording === true && breakpoint === "tablet");
  return (sidebar && base.desktopText?.(copy)) || base.text(copy);
}

export function stepsFor(state: TourState): readonly TourStep[] {
  return TOUR_STEPS.filter((step) => !step.skip?.(state));
}
