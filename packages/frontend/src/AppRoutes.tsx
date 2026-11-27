import { Navigate, Route, Routes } from "react-router-dom";
import { PublicOnly, RequireAuth, TutorialGate } from "./components/Guards";
import { PageLayout } from "./components/PageLayout";
import { HomeRoute } from "./mode/ModeProvider";
import ActorSearch from "./screens/ActorSearch";
import Filters from "./screens/Filters";
import ForgotPassword from "./screens/ForgotPassword";
import History from "./screens/History";
import Install from "./screens/Install";
import Home from "./screens/Home";
import JoinInvite from "./screens/JoinInvite";
import Login from "./screens/Login";
import MatchFound from "./screens/MatchFound";
import Members from "./screens/Members";
import Profile from "./screens/Profile";
import Register from "./screens/Register";
import Settings from "./screens/Settings";
import TourStart from "./screens/TourStart";
import Tutorial from "./screens/Tutorial";

export function AppRoutes(): JSX.Element {
  return (
    <Routes>
      <Route element={<PublicOnly />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
      </Route>

      <Route element={<RequireAuth />}>
        <Route path="/tour" element={<TourStart />} />
        <Route path="/tutorial" element={<Tutorial />} />
        <Route element={<TutorialGate />}>
          <Route element={<PageLayout gradient bottomNav fill />}>
            <Route
              path="/"
              element={
                <HomeRoute>
                  <Home />
                </HomeRoute>
              }
            />
            <Route path="/shows" element={<Home />} />
          </Route>
          <Route element={<PageLayout bottomNav />}>
            <Route path="/filters" element={<Filters />} />
            <Route path="/shows/filters" element={<Filters />} />
          </Route>
          <Route element={<PageLayout bare />}>
            <Route path="/filters/actors" element={<ActorSearch />} />
            <Route path="/shows/filters/actors" element={<ActorSearch />} />
          </Route>
          <Route element={<PageLayout gradient />}>
            <Route path="/match/:matchId" element={<MatchFound />} />
            <Route path="/shows/match/:matchId" element={<MatchFound />} />
          </Route>
          <Route element={<PageLayout title="History" />}>
            <Route path="/history" element={<History />} />
          </Route>
          <Route element={<PageLayout title="Room Members" />}>
            <Route path="/members" element={<Members />} />
          </Route>
          <Route element={<PageLayout title="Profile" />}>
            <Route path="/profile" element={<Profile />} />
          </Route>
          <Route element={<PageLayout title="Settings" />}>
            <Route path="/settings" element={<Settings />} />
          </Route>
          <Route element={<PageLayout title="Install the App" />}>
            <Route path="/install" element={<Install />} />
          </Route>
          <Route element={<PageLayout />}>
            <Route path="/join/:code" element={<JoinInvite />} />
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
