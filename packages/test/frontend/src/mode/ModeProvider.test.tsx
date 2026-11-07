import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { HomeRoute, ModeProvider, useMode } from "@movie-date/frontend/mode/ModeProvider";
import { MODE_COPY } from "@movie-date/frontend/mode/modeCopy";
import {
  actorsPath,
  filtersPath,
  homePath,
  isFiltersPath,
  matchIdOfPath,
  matchPath,
  modeOfPath,
  MOVIES_STATE,
} from "@movie-date/frontend/mode/modeRoutes";

const STORAGE_KEY = "movieDateMode";

let navigateTo: ReturnType<typeof useNavigate>;

function Probe(): JSX.Element {
  const { mode, copy } = useMode();
  navigateTo = useNavigate();
  return (
    <>
      <div data-testid="mode">{mode}</div>
      <div data-testid="title">{copy.appTitle}</div>
      <div data-testid="path">{useLocation().pathname}</div>
    </>
  );
}

function renderAt(path: string, state?: unknown) {
  return render(
    <MemoryRouter
      initialEntries={[{ pathname: path, state }]}
      future={{ v7_startTransition: false, v7_relativeSplatPath: true }}
    >
      <ModeProvider>
        <Routes>
          <Route
            path="/"
            element={
              <HomeRoute>
                <Probe />
              </HomeRoute>
            }
          />
          <Route path="*" element={<Probe />} />
        </Routes>
      </ModeProvider>
    </MemoryRouter>,
  );
}

const mode = () => screen.getByTestId("mode").textContent;
const path = () => screen.getByTestId("path").textContent;
const theme = () => document.documentElement.dataset.theme;

beforeEach(() => localStorage.clear());

afterEach(() => {
  vi.restoreAllMocks();
  document.head.innerHTML = "";
  delete document.documentElement.dataset.theme;
});

describe("which mode someone is in", () => {
  it.each([
    ["/", "MOVIE"],
    ["/filters", "MOVIE"],
    ["/match/m1", "MOVIE"],
    ["/shows", "TV"],
    ["/shows/filters", "TV"],
    ["/shows/filters/actors", "TV"],
    ["/shows/match/s1", "TV"],
  ])("%s is %s", (route, expected) => {
    renderAt(route);
    expect(mode()).toBe(expected);
  });

  it("starts in Movies on a shared screen with nothing remembered", () => {
    renderAt("/history");
    expect(mode()).toBe("MOVIE");
  });

  it("keeps the last mode through a shared screen", () => {
    renderAt("/shows");

    act(() => navigateTo("/history"));

    expect(mode()).toBe("TV");
    expect(theme()).toBe("shows");
  });

  it("gives the copy for the mode", () => {
    renderAt("/shows");
    expect(screen.getByTestId("title")).toHaveTextContent("Going Steady");
  });
});

describe("remembering it on this device", () => {
  it("stores the mode", () => {
    renderAt("/shows");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("TV");
  });

  it("reads it back on a shared screen", () => {
    localStorage.setItem(STORAGE_KEY, "TV");
    renderAt("/settings");
    expect(mode()).toBe("TV");
  });

  it("lets the URL win over what's remembered", () => {
    localStorage.setItem(STORAGE_KEY, "TV");
    renderAt("/filters");

    expect(mode()).toBe("MOVIE");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("MOVIE");
  });

  it("ignores a value it doesn't recognise", () => {
    localStorage.setItem(STORAGE_KEY, "PODCAST");
    renderAt("/settings");
    expect(mode()).toBe("MOVIE");
  });

  it("works with storage blocked, following the URL for the session", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    renderAt("/shows");
    expect(mode()).toBe("TV");

    act(() => navigateTo("/history"));
    expect(mode()).toBe("TV");
  });
});

describe("opening at the root", () => {
  it("stays on Movies for someone who was there", () => {
    renderAt("/");
    expect(path()).toBe("/");
    expect(mode()).toBe("MOVIE");
  });

  it("returns someone to Going Steady, which is what the installed app's start URL needs", () => {
    localStorage.setItem(STORAGE_KEY, "TV");
    renderAt("/");

    expect(path()).toBe("/shows");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("TV");
  });

  it("keeps a plain go-home in Going Steady", () => {
    renderAt("/shows/match/s1");

    act(() => navigateTo("/"));

    expect(path()).toBe("/shows");
    expect(mode()).toBe("TV");
  });

  it("moves to Movies for a link that asks for them", () => {
    renderAt("/shows");

    act(() => navigateTo("/", { state: MOVIES_STATE }));

    expect(path()).toBe("/");
    expect(mode()).toBe("MOVIE");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("MOVIE");
  });

  it("stays in Movies after leaving a movie match opened from Going Steady", () => {
    renderAt("/shows");

    act(() => navigateTo("/match/m1"));
    act(() => navigateTo("/"));

    expect(path()).toBe("/");
    expect(mode()).toBe("MOVIE");
  });
});

describe("the theme", () => {
  const addMeta = (): HTMLMetaElement => {
    const meta = document.createElement("meta");
    meta.name = "theme-color";
    meta.content = "#000000";
    document.head.append(meta);
    return meta;
  };

  const addThemes = (): void => {
    const style = document.createElement("style");
    style.textContent = `
      [data-theme="movies"] { --theme-status-bar: #111111; }
      [data-theme="shows"] { --theme-status-bar: #222222; }
    `;
    document.head.append(style);
  };

  it("follows the mode on the root element", () => {
    renderAt("/");
    expect(theme()).toBe("movies");

    act(() => navigateTo("/shows"));
    expect(theme()).toBe("shows");
  });

  it("names the mode in the tab, and goes back to Movie Date with it", () => {
    renderAt("/shows");
    expect(document.title).toBe("Going Steady");
    act(() => {
      navigateTo("/", { state: MOVIES_STATE });
    });
    expect(document.title).toBe("Movie Date");
  });

  it("copies the theme's status bar colour to the PWA theme-color", () => {
    const meta = addMeta();
    addThemes();
    renderAt("/");
    expect(meta.content).toBe("#111111");

    act(() => navigateTo("/shows"));
    expect(meta.content).toBe("#222222");
  });

  it("leaves the theme-color alone if the stylesheet hasn't loaded", () => {
    const meta = addMeta();
    renderAt("/shows");
    expect(meta.content).toBe("#000000");
  });

  it("hands the Movies theme back to login on the way out", () => {
    const { unmount } = renderAt("/shows");
    unmount();
    expect(theme()).toBe("movies");
  });

  it("keeps the remembered mode through a log out", () => {
    const { unmount } = renderAt("/shows");
    unmount();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("TV");
  });
});

describe("paths", () => {
  it("keeps every movie path as it was", () => {
    expect(homePath("MOVIE")).toBe("/");
    expect(filtersPath("MOVIE")).toBe("/filters");
    expect(actorsPath("MOVIE")).toBe("/filters/actors");
    expect(matchPath("MOVIE", "m1")).toBe("/match/m1");
  });

  it("mirrors them under /shows", () => {
    expect(homePath("TV")).toBe("/shows");
    expect(filtersPath("TV")).toBe("/shows/filters");
    expect(actorsPath("TV")).toBe("/shows/filters/actors");
    expect(matchPath("TV", "s1")).toBe("/shows/match/s1");
  });

  it.each(["/history", "/members", "/profile", "/settings", "/tutorial", "/join/ABC234", "/showstopper", "/filtersx"])(
    "treats %s as shared",
    (route) => {
      expect(modeOfPath(route)).toBeNull();
    },
  );

  it("finds the match id in either mode", () => {
    expect(matchIdOfPath("/match/m1")).toBe("m1");
    expect(matchIdOfPath("/shows/match/s1")).toBe("s1");
    expect(matchIdOfPath("/shows")).toBeUndefined();
  });

  it("knows the filter screens in either mode", () => {
    for (const route of ["/filters", "/filters/actors", "/shows/filters", "/shows/filters/actors"]) {
      expect(isFiltersPath(route)).toBe(true);
    }
    expect(isFiltersPath("/shows")).toBe(false);
    expect(isFiltersPath("/filtersx")).toBe(false);
  });
});

describe("copy", () => {
  it("has the fixed Going Steady labels", () => {
    expect(MODE_COPY.TV).toMatchObject({
      likeOverlay: "Go Steady",
      passOverlay: "Just Friends",
      matchHeadline: "It's Official",
      matchTagline: "Your Next Show!",
      backToStart: "Keep Looking",
    });
  });

  it("keeps the movie labels", () => {
    expect(MODE_COPY.MOVIE).toMatchObject({
      likeOverlay: "Watch Movie",
      passOverlay: "Don't Watch",
      matchHeadline: "Match Found",
      matchTagline: "Your Movie Tonight!",
      backToStart: "Back to Start",
    });
  });

  it("never lets a show string name a movie", () => {
    expect(JSON.stringify(MODE_COPY.TV)).not.toMatch(/\bmovies?\b/i);
  });
});

describe("mode-boot.js, before the app has loaded", () => {
  const script = readFileSync(resolve(__dirname, "../../../../frontend/public/mode-boot.js"), "utf8");

  function boot(path: string, remembered: string | null): string | undefined {
    window.history.replaceState(null, "", path);
    if (remembered) localStorage.setItem("movieDateMode", remembered);
    else localStorage.removeItem("movieDateMode");
    delete document.documentElement.dataset.theme;
    new Function(script)();
    return document.documentElement.dataset.theme;
  }

  afterEach(() => {
    window.history.replaceState(null, "", "/");
    localStorage.clear();
    delete document.documentElement.dataset.theme;
  });

  it.each([
    ["/shows", null],
    ["/shows/match/m1", "MOVIE"],
    ["/", "TV"],
    ["/history", "TV"],
  ])("paints %s with remembered %s as Going Steady", (path, remembered) => {
    expect(boot(path, remembered)).toBe("shows");
  });

  it.each([
    ["/", null],
    ["/history", "MOVIE"],
    ["/filters", "TV"],
    ["/match/m1", "TV"],
    ["/login", "TV"],
    ["/register", "TV"],
  ])("leaves %s with remembered %s alone", (path, remembered) => {
    expect(boot(path, remembered)).toBeUndefined();
  });
});
