import type { ReactNode } from "react";
import { useLocation } from "react-router-dom";
import "./RouteTransition.css";

/**
 * Plays the enter animation on each new path. Only the pathname counts, so a query
 * change like History's tab doesn't remount the screen. Enter only: keeping the old
 * screen for an exit would run its effects and subscriptions a beat too long.
 */
export function RouteTransition({ className, children }: { className?: string; children: ReactNode }): JSX.Element {
  const { pathname } = useLocation();
  return (
    <div key={pathname} className={className ? `md-route-transition ${className}` : "md-route-transition"}>
      {children}
    </div>
  );
}
