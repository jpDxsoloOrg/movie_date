/** Tour Provider component that manages the tour lifecycle. */
import { useEffect, useMemo, useState, useCallback } from "react";
import { useLocation, Navigate, Outlet, useNavigate } from "react-router-dom";
import { hasSeenTutorial } from "../../services/tutorial";
import { useReturnPath } from "../../hooks/useReturnPath";
import { TourOverlay } from "./TourOverlay";
import type { TutorialStep } from "./types";

export interface TourConfig extends Omit<TutorialStep, "route"> {
  route: string;
}

export const TUTORIAL_STEPS: readonly TourConfig[] = [
  { id: "deck", route: "/", anchor: ".room-deck", caption: { text: ({ noun }) => `Tap a ${noun.one} to see its details, trailer, and where to watch.`, alt: ({ noun }, device) => device === "desktop" ? `The Movies deck with a poster on top` : `The Movie Date app showing a movie poster in the deck`, } },
  { id: "details", route: "/shows/filters/actors", anchor: ".card", caption: { text: () => "Tap a poster to see the trailer, full story, and where to watch.", alt: ({ noun }, device) => device === "desktop" ? `Clicking a ${noun.one}'s poster opens its details` : `A ${noun.one}'s details opening over the deck`, } },
  { id: "filters", route: "/shows/filters/actors", anchor: ".md-filters-form", caption: { text: ({ tutorial }) => `Tap Search to narrow the deck by ${tutorial.searchFields}. Everyone in the room swipes the same deck.`, alt: () => "The Search page, with genres and actors to filter by.", } },
  { id: "match", route: "/shows/match/:matchId", anchor: ".celebration-overlay", caption: { text: () => `You've matched! Celebrate, then see where to watch.`, alt: () => "Celebration overlay with confetti after a match.", } },
  { id: "invite", route: "/members", anchor: ".room-invite-panel", caption: { text: () => `Invite someone to your room. They can join with this code or QR code.`, alt: () => "Room Members page showing who's in the room and invite options.", } },
  { id: "join", route: "/join/:code", anchor: ".room-qr-code", caption: { text: () => "Got an invite code? Type it in to join this room.", alt: () => "Join Room dialog asking for a room code.", } },
  { id: "members", route: "/members", anchor: ".member-row", caption: { text: () => "Room Members shows everyone in your room, and lets you leave. Set your own name and photo on Profile.", alt: () => "Room Members listing everyone by name and photo.", } },
  { id: "settings", route: "/settings", anchor: ".room-settings", caption: { text: () => "In Settings, choose how many yeses make a match, or require a majority of the room.", alt: () => "Settings with number of yeses for match and majority switch.", } },
  { id: "history", route: "/history", anchor: ".match-history-list", caption: { text: ({ noun }) => `History keeps your matches and swipes, with search. Reset your swipes puts every ${noun.one} back in your deck.`, alt: () => "History listing the room's matched movies/shows.", } },
  { id: "mode", route: "/shows", anchor: ".md-switch-modes", caption: { text: ({ noun }) => "Switch between Movies and Going Steady. Each has its own deck, filters, matches, in its own colours.", alt: () => `The ${noun.one} switch at the top of the app`, } },
  { id: "plex", route: "/shows/filters/actors", anchor: ".watch-button-plex", caption: { text: () => "Link your Plex on Profile to see what's already on Plex and filter by it.", alt: () => "Details page showing whether a title is on Plex.", } },
  { id: "install", route: "/install", anchor: ".md-install-app-button", caption: { text: () => "Install App keeps Movie Date on your home screen. It opens like any other app, or in a separate window on desktop.", alt: () => "Install App button near the bottom of the menu/sidebar.", } },
];

export function TourProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const location = useLocation();
  const returnPath = useReturnPath();
  const navigate = useNavigate();
  const [stepIndex, setStepIndex] = useState<number>(0);
  const activeStep = useMemo(() => TUTORIAL_STEPS[stepIndex], [stepIndex]);

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("tourStepIndex");
      if (stored) {
        const index = parseInt(stored, 10);
        if (!isNaN(index) && index < TUTORIAL_STEPS.length) {
          setStepIndex(index);
        }
      }
    } catch {
      // Ignore storage errors.
    }
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem("tourStepIndex", String(stepIndex));
    } catch {
      // Ignore.
    }
  }, [stepIndex]);

  const startNewTour = useCallback(() => {
    if (hasSeenTutorial()) return false;
    try {
      sessionStorage.setItem("tourStepIndex", "0");
    } catch {
      // Ignore.
    }
    return true;
  }, []);

  const goToNext = useCallback(() => {
    setStepIndex((prev) => Math.min(prev + 1, TUTORIAL_STEPS.length - 1));
  }, []);

  const skipTour = useCallback(async () => {
    try {
      sessionStorage.removeItem("tourStepIndex");
    } catch {
      // Ignore.
    }
    await markTutorialSeen();
    navigate(returnPath, { replace: true });
  }, [returnPath]);

  async function markTutorialSeen(): Promise<void> {
    try {
      sessionStorage.setItem("hasSeenTutorial", "true");
      localStorage.setItem("hasSeenTutorial", "true");
    } catch {
      // Ignore.
    }
  }

  const [isTourRunning, setIsTourRunning] = useState(() => startNewTour());

  if (activeStep && isTourRunning) {
    return <TourOverlay anchorId={activeStep.anchor}>{children}</TourOverlay>;
  }

  return <Outlet />;
}

export function TourOverlay({ children }: { children?: React.ReactNode }): JSX.Element {
  return null;
}
