import { useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { useLogOut } from "../hooks/useLogOut";
import { useInstallApp } from "../install/useInstallApp";
import { useMode } from "../mode/ModeProvider";
import { SHOWS_HOME } from "../mode/modeRoutes";
import { Icon, type IconName } from "./Icon";
import JoinRoomDialog from "./JoinRoomDialog";
import {
  APP_VERSION,
  NAV_GOING_STEADY,
  NAV_HISTORY,
  NAV_MEMBERS,
  NAV_PROFILE,
  NAV_SETTINGS,
  NAV_TUTORIAL,
  TMDB_ATTRIBUTION,
  navHome,
  navSearch,
  type NavItem,
} from "./navigation";
import { BrandMark, Wordmark } from "./Wordmark";
import "./SideNav.css";

const ROOM_LINKS: readonly NavItem[] = [NAV_HISTORY, NAV_MEMBERS];
const ACCOUNT_LINKS: readonly NavItem[] = [NAV_PROFILE, NAV_SETTINGS, NAV_TUTORIAL];

export interface SideNavProps {
  /** The tablet rail: fewer entries, with the rest in the drawer behind More. */
  rail: boolean;
  onOpenMenu: () => void;
}

function SideNavButton({
  icon,
  label,
  railLabel,
  rail,
  onClick,
  tour,
}: {
  icon: IconName;
  label: string;
  railLabel?: string;
  rail: boolean;
  onClick: () => void;
  tour?: string;
}): JSX.Element {
  return (
    <li>
      <button
        type="button"
        className="md-side-nav__item"
        aria-label={rail && railLabel ? label : undefined}
        data-tour={tour}
        onClick={onClick}
      >
        <Icon name={icon} />
        {rail ? (railLabel ?? label) : label}
      </button>
    </li>
  );
}

/** The persistent navigation from 640px up. Under it, AppBar, Drawer and BottomNav do this job. */
export function SideNav({ rail, onOpenMenu }: SideNavProps): JSX.Element {
  const { mode, copy } = useMode();
  const logOut = useLogOut();
  const [joinOpen, setJoinOpen] = useState(false);
  const installApp = useInstallApp();

  const renderLink = ({ to, label, railLabel, icon, state, tour }: NavItem): JSX.Element => (
    <li key={to}>
      <NavLink
        to={to}
        state={state}
        end={to === "/" || to === SHOWS_HOME}
        className="md-side-nav__item"
        aria-label={rail && railLabel ? label : undefined}
        data-tour={tour}
      >
        <Icon name={icon} />
        {rail ? (railLabel ?? label) : label}
      </NavLink>
    </li>
  );

  return (
    <>
      <nav className={rail ? "md-side-nav md-side-nav--rail" : "md-side-nav"} aria-label="Main">
        <Link to="/" className="md-side-nav__brand" aria-label={`${copy.appTitle} home`}>
          {rail ? <BrandMark /> : <Wordmark />}
        </Link>
        <div className="md-side-nav__scroll">
          <ul className="md-side-nav__list">
            {[navHome(mode), NAV_GOING_STEADY, navSearch(mode)].map(renderLink)}
            <SideNavButton icon="door" label="Join Room" railLabel="Join" rail={rail} onClick={() => setJoinOpen(true)} tour="nav-join" />
          </ul>
          <ul className="md-side-nav__list">{ROOM_LINKS.map(renderLink)}</ul>
          {!rail && (
            <ul className="md-side-nav__list md-side-nav__list--end">
              {ACCOUNT_LINKS.map(renderLink)}
              {!installApp.installed && (
                <SideNavButton icon="install" label="Install App" rail={false} onClick={() => void installApp.install()} />
              )}
              <SideNavButton icon="logout" label="Log Out" rail={false} onClick={() => void logOut()} />
            </ul>
          )}
        </div>
        {/* Outside the scroller: it's the only way to Profile, Settings and Log Out on the rail. */}
        {rail && (
          <ul className="md-side-nav__list md-side-nav__pinned">
            <SideNavButton icon="menu" label="More" rail onClick={onOpenMenu} />
          </ul>
        )}
        {!rail && (
          <footer className="md-side-nav__footer">
            <p>Version v{APP_VERSION}</p>
            <p>{TMDB_ATTRIBUTION}</p>
          </footer>
        )}
      </nav>
      <JoinRoomDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
    </>
  );
}
