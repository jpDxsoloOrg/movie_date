import { Navigate, Outlet, useLocation } from "react-router-dom";
import { RoomProvider } from "../context/RoomProvider";
import { useAuth } from "../hooks/useAuth";
import { currentPath, returnPathFrom, type ReturnState } from "../hooks/useReturnPath";
import { ModeProvider } from "../mode/ModeProvider";
import { hasSeenTutorial } from "../services/tutorial";
import { SkeletonPage } from "./Skeleton";
import { TourProvider, useTour } from "./tour/TourProvider";

/** Everything behind login. Screens under it can rely on useRoom() having a room. */
export function RequireAuth(): JSX.Element {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "signedOut") {
    const state: ReturnState = { from: currentPath(location) };
    return <Navigate to="/login" replace state={state} />;
  }
  // Around the loading state too, so someone in Going Steady doesn't get a Movies skeleton.
  return (
    <ModeProvider>
      {status === "loading" ? (
        <SkeletonPage />
      ) : (
        <RoomProvider>
          <TourProvider>
            <Outlet />
          </TourProvider>
        </RoomProvider>
      )}
    </ModeProvider>
  );
}

/** Login screens. Signing in lands here, which is what returns someone to where they were. */
export function PublicOnly(): JSX.Element {
  const { status } = useAuth();
  const location = useLocation();

  if (status === "loading") return <SkeletonPage />;
  if (status === "signedIn") return <Navigate to={returnPathFrom(location.state)} replace />;
  return <Outlet />;
}

/** First run starts the live tour, which then walks through the screens behind this gate. */
export function TutorialGate(): JSX.Element {
  const location = useLocation();
  const { active } = useTour();
  if (active || hasSeenTutorial()) return <Outlet />;
  const state: ReturnState = { from: currentPath(location) };
  return <Navigate to="/tour" replace state={state} />;
}
