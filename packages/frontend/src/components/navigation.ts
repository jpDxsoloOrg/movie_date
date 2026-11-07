import type { IconName } from "./Icon";

export interface NavItem {
  to: string;
  label: string;
  /** What the tablet rail shows, where the full label wouldn't fit. */
  railLabel?: string;
  icon: IconName;
}

export const NAV_HOME: NavItem = { to: "/", label: "Home", icon: "home" };
export const NAV_SEARCH: NavItem = { to: "/filters", label: "Search", icon: "search" };
export const NAV_HISTORY: NavItem = { to: "/history", label: "History", icon: "history" };
export const NAV_MEMBERS: NavItem = { to: "/members", label: "Room Members", railLabel: "Members", icon: "movie" };
export const NAV_PROFILE: NavItem = { to: "/profile", label: "Profile", icon: "person" };
export const NAV_TUTORIAL: NavItem = { to: "/tutorial", label: "Tutorial", icon: "info" };
export const NAV_SETTINGS: NavItem = { to: "/settings", label: "Settings", icon: "settings" };

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";
export const TMDB_ATTRIBUTION = "This product uses the TMDB API but is not endorsed or certified by TMDB";
