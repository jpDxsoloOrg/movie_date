import { useEffect } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { SkeletonPage } from "../components/Skeleton";
import { useTour } from "../components/tour/TourProvider";
import { useReturnPath } from "../hooks/useReturnPath";

/**
 * Starts the live tour, from the first-run gate or the menu's Tutorial. The tour then
 * moves to its first screen. Offline, the screens it visits can't load, so the
 * screenshot tutorial stands in.
 */
export default function TourStart(): JSX.Element {
  const { start } = useTour();
  const location = useLocation();
  const returnTo = useReturnPath();
  const online = typeof navigator === "undefined" || navigator.onLine !== false;

  useEffect(() => {
    if (online) start(returnTo);
  }, [online, start, returnTo]);

  if (!online) return <Navigate to="/tutorial" replace state={location.state} />;
  return <SkeletonPage />;
}
