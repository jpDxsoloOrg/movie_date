import { Navigate, Outlet, useLocation } from "react-router-dom";
import { RoomProvider } from "../context/RoomProvider";
import { InviteProvider } from "../context/InviteProvider";
import { SheetProvider } from "../context/SheetProvider";
import { DrawerProvider } from "../context/DrawerProvider";
import { useAuth } from "../hooks/useAuth";
import { currentPath, returnPathFrom, type ReturnState } from "../hooks/useReturnPath";
import { ModeProvider } from "../mode/ModeProvider";
import { hasSeenTutorial } from "../services/tutorial";
import { SkeletonPage } from "./Skeleton";
import { TourProvider } from "./tour/TourProvider";

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
        <DrawerProvider>
          <SheetProvider>
            <InviteProvider>
              <RoomProvider>
                <TourProvider>
                  <Outlet />
                </TourProvider>
              </RoomProvider>
            </InviteProvider>
          </SheetProvider>
        </DrawerProvider>
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

/** TutorialGate: on first run, start the tour; otherwise pass through. */
export function TutorialGate(): JSX.Element {
  const location = useLocation();
  if (hasSeenTutorial()) return <Outlet />;
  // Start the tour on first run instead of redirecting to /tutorial.
  const state: ReturnState = { from: currentPath(location) };
  return <Navigate to="/" replace state={state} />;
}

