import { NavLink, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { revokeSessions, signOut } from "../services/auth";
import { Icon, type IconName } from "./Icon";
import "./Drawer.css";

const PRIMARY_LINKS: readonly { to: string; label: string; icon: IconName }[] = [
  { to: "/", label: "Home", icon: "home" },
  { to: "/profile", label: "Profile", icon: "person" },
  { to: "/members", label: "Room Members", icon: "movie" },
  { to: "/history", label: "History", icon: "history" },
];

const SECONDARY_LINKS: readonly { to: string; label: string; icon: IconName }[] = [
  { to: "/tutorial", label: "Tutorial", icon: "info" },
  { to: "/settings", label: "Settings", icon: "settings" },
];

const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
}

export function Drawer({ open, onClose }: DrawerProps): JSX.Element | null {
  const navigate = useNavigate();
  const trap = useFocusTrap<HTMLElement>(open, onClose);
  if (!open) return null;

  const logOut = async (): Promise<void> => {
    onClose();
    await revokeSessions();
    signOut();
    // Before the auth guard sees the sign-out, or it saves this page as the return path.
    navigate("/login", { replace: true });
  };

  const renderLink = ({ to, label, icon }: (typeof PRIMARY_LINKS)[number]): JSX.Element => (
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
        <div className="md-drawer__header">Movie Date</div>
        <ul className="md-drawer__list">
          <li>
            <button type="button" className="md-drawer__item" onClick={() => void logOut()}>
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
          <p className="md-drawer__attribution">
            This product uses the TMDB API but is not endorsed or certified by TMDB
          </p>
        </footer>
      </nav>
    </div>,
    document.body,
  );
}
