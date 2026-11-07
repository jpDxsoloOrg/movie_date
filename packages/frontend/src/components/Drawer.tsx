import { NavLink } from "react-router-dom";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useLogOut } from "../hooks/useLogOut";
import { Icon } from "./Icon";
import {
  APP_VERSION,
  NAV_HISTORY,
  NAV_HOME,
  NAV_MEMBERS,
  NAV_PROFILE,
  NAV_SETTINGS,
  NAV_TUTORIAL,
  TMDB_ATTRIBUTION,
  type NavItem,
} from "./navigation";
import { Wordmark } from "./Wordmark";
import "./Drawer.css";

const PRIMARY_LINKS: readonly NavItem[] = [NAV_HOME, NAV_PROFILE, NAV_MEMBERS, NAV_HISTORY];
const SECONDARY_LINKS: readonly NavItem[] = [NAV_TUTORIAL, NAV_SETTINGS];

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
}

export function Drawer({ open, onClose }: DrawerProps): JSX.Element | null {
  const logOut = useLogOut();
  const trap = useFocusTrap<HTMLElement>(open, onClose);
  if (!open) return null;

  const closeAndLogOut = async (): Promise<void> => {
    onClose();
    await logOut();
  };

  const renderLink = ({ to, label, icon }: NavItem): JSX.Element => (
    <li key={to}>
      <NavLink to={to} end className="md-drawer__item" onClick={onClose}>
        <Icon name={icon} />
        {label}
      </NavLink>
    </li>
  );

  return createPortal(
    <div className="md-drawer" onClick={onClose}>
      <nav
        ref={trap.ref}
        className="md-drawer__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        tabIndex={-1}
        onKeyDown={trap.onKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="md-drawer__header">
          <Wordmark />
        </div>
        <ul className="md-drawer__list">
          <li>
            <button type="button" className="md-drawer__item" onClick={() => void closeAndLogOut()}>
              <Icon name="logout" />
              Log Out
            </button>
          </li>
          <li className="md-drawer__divider" aria-hidden="true" />
          {PRIMARY_LINKS.map(renderLink)}
          <li className="md-drawer__divider" aria-hidden="true" />
          {SECONDARY_LINKS.map(renderLink)}
        </ul>
        <footer className="md-drawer__footer">
          <p className="md-drawer__version">Version v{APP_VERSION}</p>
          <p className="md-drawer__attribution">{TMDB_ATTRIBUTION}</p>
        </footer>
      </nav>
    </div>,
    document.body,
  );
}
