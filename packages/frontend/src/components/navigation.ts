import { filtersPath, MOVIES_STATE, SHOWS_HOME, type ModeRouteState } from "../mode/modeRoutes";
import type { MediaType } from "../services/api";
import type { IconName } from "./Icon";

export interface NavItem {
  to: string;
  label: string;
  /** What the tablet rail shows, where the full label wouldn't fit. */
  railLabel?: string;
  icon: IconName;
  /** Router state the link carries. */
  state?: ModeRouteState;
  /** The live tour's anchor on this item. */
  tour?: string;
}

export const NAV_HOME: NavItem = { to: "/", label: "Home", icon: "home" };
export const NAV_GOING_STEADY: NavItem = { to: SHOWS_HOME, label: "Going Steady", railLabel: "Shows", icon: "tv" };
export const NAV_SEARCH: NavItem = { to: "/filters", label: "Search", icon: "search", tour: "nav-search" };
export const NAV_HISTORY: NavItem = { to: "/history", label: "History", icon: "history" };
export const NAV_MEMBERS: NavItem = { to: "/members", label: "Room Members", railLabel: "Members", icon: "movie" };
export const NAV_PROFILE: NavItem = { to: "/profile", label: "Profile", icon: "person" };
export const NAV_TUTORIAL: NavItem = { to: "/tour", label: "Tutorial", icon: "info" };
export const NAV_SETTINGS: NavItem = { to: "/settings", label: "Settings", icon: "settings" };

/** Going Steady has its own entry, so from there this one is the way back to Movies. */
export function navHome(mode: MediaType): NavItem {
  return mode === "TV" ? { ...NAV_HOME, label: "Movies", state: MOVIES_STATE } : NAV_HOME;
}

export function navSearch(mode: MediaType): NavItem {
  return { ...NAV_SEARCH, to: filtersPath(mode) };
}

export const APP_VERSION = import.meta.env.VITE_APP_VERSION ?? "dev";
export const TMDB_ATTRIBUTION = "This product uses the TMDB API but is not endorsed or certified by TMDB";
