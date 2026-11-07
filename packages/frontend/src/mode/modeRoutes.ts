/**
 * Where each mode lives. Movies keep the paths they've always had; Going Steady mirrors
 * them under /shows. History, Members, Profile and Settings are shared, and show the
 * mode the person was last in.
 *
 * Use these for every link into a deck, filters or a match. A bare "/filters" from a
 * show screen switches the person to Movies.
 */
import type { MediaType } from "../services/api";

export const MOVIES_HOME = "/";
export const SHOWS_HOME = "/shows";

const SHOWS_PATH = /^\/shows(\/|$)/;
const MOVIE_PATH = /^\/(filters(\/|$)|match\/|$)/;
const MATCH_PATH = /^(?:\/shows)?\/match\/([^/]+)/;
const FILTERS_PATH = /^(?:\/shows)?\/filters(\/|$)/;

export function homePath(mode: MediaType): string {
  return mode === "TV" ? SHOWS_HOME : MOVIES_HOME;
}

export function filtersPath(mode: MediaType): string {
  return mode === "TV" ? "/shows/filters" : "/filters";
}

export function actorsPath(mode: MediaType): string {
  return `${filtersPath(mode)}/actors`;
}

export function matchPath(mode: MediaType, matchId: string): string {
  return mode === "TV" ? `/shows/match/${matchId}` : `/match/${matchId}`;
}

/** The mode a path belongs to, or null for a shared screen. */
export function modeOfPath(pathname: string): MediaType | null {
  if (SHOWS_PATH.test(pathname)) return "TV";
  return MOVIE_PATH.test(pathname) ? "MOVIE" : null;
}

export function matchIdOfPath(pathname: string): string | undefined {
  return MATCH_PATH.exec(pathname)?.[1];
}

export function isFiltersPath(pathname: string): boolean {
  return FILTERS_PATH.test(pathname);
}

/**
 * Router state for a link that means Movies. A bare "/" means home in the person's own
 * mode, which is what lets every "go home" in the app, and the installed app's start
 * URL, stay in Going Steady without knowing about it.
 */
export interface ModeRouteState {
  movies?: boolean;
  /** Put focus back on the switch, which remounts with the screen. */
  focusSwitch?: boolean;
}

export const MOVIES_STATE: ModeRouteState = { movies: true };

export function wantsMovies(state: unknown): boolean {
  return (state as ModeRouteState | null)?.movies === true;
}
