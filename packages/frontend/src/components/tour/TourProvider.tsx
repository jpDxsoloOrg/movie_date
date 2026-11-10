import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useInstallApp } from "../../install/useInstallApp";
import { useMode } from "../../mode/ModeProvider";
import { markTutorialSeen } from "../../services/tutorial";
import { TourOverlay } from "./TourOverlay";
import { stepsFor, tourText, tourTitle } from "./tourSteps";

/** Survives a reload mid-tour, and goes with the tab. */
export const TOUR_STORAGE_KEY = "movieDateTour";

interface TourProgress {
  index: number;
  /** Where Finish and Skip return to, such as an invite link someone arrived on. */
  returnTo: string;
}

function readProgress(): TourProgress | null {
  try {
    const raw = sessionStorage.getItem(TOUR_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      "index" in parsed &&
      "returnTo" in parsed &&
      typeof parsed.index === "number" &&
      typeof parsed.returnTo === "string" &&
      parsed.returnTo.startsWith("/")
    ) {
      return { index: parsed.index, returnTo: parsed.returnTo };
    }
  } catch {
    // Unreadable or blocked storage: the tour just starts fresh.
  }
  return null;
}

function writeProgress(progress: TourProgress | null): void {
  try {
    if (progress) sessionStorage.setItem(TOUR_STORAGE_KEY, JSON.stringify(progress));
    else sessionStorage.removeItem(TOUR_STORAGE_KEY);
  } catch {
    // Without storage a reload ends the tour, which is all that's lost.
  }
}

export interface TourContextValue {
  active: boolean;
  start: (returnTo: string) => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const value = useContext(TourContext);
  if (!value) throw new Error("useTour must be used inside TourProvider");
  return value;
}

/**
 * Runs the live tour over the signed-in app: each step opens its real screen, and the
 * overlay points at the part it's about. Inside RoomProvider, so screens have their room.
 */
export function TourProvider({ children }: { children: ReactNode }): JSX.Element {
  const [progress, setProgress] = useState<TourProgress | null>(readProgress);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { mode, copy } = useMode();
  const breakpoint = useBreakpoint();
  const { installed } = useInstallApp();
  const steps = useMemo(() => stepsFor({ installed }), [installed]);

  const update = useCallback((next: TourProgress | null) => {
    writeProgress(next);
    setProgress(next);
  }, []);

  const start = useCallback((returnTo: string) => update({ index: 0, returnTo }), [update]);

  const index = progress ? Math.min(progress.index, steps.length - 1) : 0;
  const step = progress ? steps[index] : undefined;
  const route = step?.route(mode);

  // The tour drives the route, so Back in the browser lands on the step's screen again.
  useEffect(() => {
    if (route && pathname !== route) navigate(route);
  }, [route, pathname, navigate]);

  const finish = useCallback(() => {
    if (!progress) return;
    markTutorialSeen();
    update(null);
    navigate(progress.returnTo, { replace: true });
  }, [progress, update, navigate]);

  const value = useMemo(() => ({ active: progress !== null, start }), [progress, start]);

  return (
    <TourContext.Provider value={value}>
      {children}
      {progress && step && route === pathname && (
        <TourOverlay
          key={step.id}
          step={step}
          stepNumber={index + 1}
          total={steps.length}
          title={tourTitle(step, copy)}
          text={tourText(step, copy, breakpoint)}
          onPrev={index > 0 ? () => update({ ...progress, index: index - 1 }) : undefined}
          onNext={index < steps.length - 1 ? () => update({ ...progress, index: index + 1 }) : finish}
          onSkip={finish}
        />
      )}
    </TourContext.Provider>
  );
}
