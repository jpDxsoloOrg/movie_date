import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMode } from "../mode/ModeProvider";
import { MODE_COPY } from "../mode/modeCopy";
import { homePath, type ModeRouteState } from "../mode/modeRoutes";
import type { MediaType } from "../services/api";
import { SegmentedControl, type SegmentOption } from "./SegmentedControl";

const OPTIONS: readonly SegmentOption<MediaType>[] = [
  { value: "MOVIE", label: MODE_COPY.MOVIE.switchLabel },
  { value: "TV", label: MODE_COPY.TV.switchLabel },
];

/** Replaces the history entry: flipping between modes shouldn't stack up for Back to undo. */
export function ModeSwitch({ className }: { className?: string }): JSX.Element {
  const { mode } = useMode();
  const navigate = useNavigate();
  const { state } = useLocation();
  const wrapper = useRef<HTMLDivElement>(null);
  const cameFromSwitch = (state as ModeRouteState | null)?.focusSwitch === true;

  // The screen remounts with the path, which would drop keyboard focus onto the body.
  useEffect(() => {
    if (cameFromSwitch) wrapper.current?.querySelector<HTMLElement>('[aria-checked="true"]')?.focus();
  }, [cameFromSwitch]);

  const change = (next: MediaType): void => {
    if (next === mode) return;
    const nextState: ModeRouteState = { movies: next === "MOVIE", focusSwitch: true };
    navigate(homePath(next), { replace: true, state: nextState });
  };

  return (
    <div ref={wrapper} className={className + " md-switch-modes"} data-tour="mode-switch">
      <SegmentedControl label="Movies or shows" options={OPTIONS} value={mode} onChange={change} onGradient />
    </div>
  );
}

