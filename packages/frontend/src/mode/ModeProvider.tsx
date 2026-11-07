import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import type { MediaType } from "../services/api";
import { MODE_COPY, type ModeCopy } from "./modeCopy";
import { modeOfPath, MOVIES_HOME, SHOWS_HOME, wantsMovies } from "./modeRoutes";

const STORAGE_KEY = "movieDateMode";
const THEME_COLOR_VARIABLE = "--theme-status-bar";

export interface ModeContextValue {
  mode: MediaType;
  copy: ModeCopy;
}

export function modeValue(mode: MediaType): ModeContextValue {
  return { mode, copy: MODE_COPY[mode] };
}

/** Movies by default, so a screen rendered on its own behaves as it always has. */
export const ModeContext = createContext<ModeContextValue>(modeValue("MOVIE"));

export function useMode(): ModeContextValue {
  return useContext(ModeContext);
}

function rememberedMode(): MediaType {
  try {
    return localStorage.getItem(STORAGE_KEY) === "TV" ? "TV" : "MOVIE";
  } catch {
    return "MOVIE";
  }
}

function rememberMode(mode: MediaType): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    // The mode still follows the URL; the next launch just starts on Movies.
  }
}

/**
 * The browser chrome can't read a CSS variable, so the theme's value is copied across.
 * public/mode-boot.js does the same before this bundle has loaded.
 */
function applyTheme(mode: MediaType): void {
  const root = document.documentElement;
  root.dataset.theme = mode === "TV" ? "shows" : "movies";
  document.title = MODE_COPY[mode].appTitle;
  const colour = getComputedStyle(root).getPropertyValue(THEME_COLOR_VARIABLE).trim();
  if (colour) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", colour);
}

/**
 * The URL decides the mode wherever it can, so a link, a reload and the back button all
 * agree with what's on screen. Shared screens keep the last mode, which is also what the
 * device remembers between visits.
 */
export function ModeProvider({ children }: { children: ReactNode }): JSX.Element {
  const { pathname, state } = useLocation();
  const remembered = useRef<MediaType | null>(null);
  remembered.current ??= rememberedMode();

  // HomeRoute is about to redirect, so this isn't a move to Movies.
  const headingHome = pathname === MOVIES_HOME && remembered.current === "TV" && !wantsMovies(state);
  const mode = headingHome ? "TV" : (modeOfPath(pathname) ?? remembered.current);
  remembered.current = mode;

  useEffect(() => rememberMode(mode), [mode]);

  useLayoutEffect(() => applyTheme(mode), [mode]);
  // Login and the other public screens are always the Movies theme.
  useLayoutEffect(() => () => applyTheme("MOVIE"), []);

  const value = useMemo(() => modeValue(mode), [mode]);
  return <ModeContext.Provider value={value}>{children}</ModeContext.Provider>;
}

/** Sits on "/": the installed app opens there, and it should open where the person left off. */
export function HomeRoute({ children }: { children: ReactNode }): JSX.Element {
  const { mode } = useMode();
  return mode === "TV" ? <Navigate to={SHOWS_HOME} replace /> : <>{children}</>;
}
