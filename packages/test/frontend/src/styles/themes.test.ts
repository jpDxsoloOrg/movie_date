import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const frontend = (path: string): string => readFileSync(resolve(__dirname, "../../../../frontend", path), "utf8");

const THEME_CSS = frontend("src/styles/themes.css");
const TOKENS_CSS = frontend("src/styles/tokens.css");

interface Rgba {
  red: number;
  green: number;
  blue: number;
  alpha: number;
}

function variablesIn(block: string): Map<string, string> {
  return new Map([...block.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map((match) => [match[1] ?? "", match[2] ?? ""]));
}

function themeBlock(selector: string): Map<string, string> {
  const start = THEME_CSS.indexOf(selector);
  expect(start).toBeGreaterThan(-1);
  return variablesIn(THEME_CSS.slice(start, THEME_CSS.indexOf("}", start)));
}

const THEMES = { movies: themeBlock('[data-theme="movies"]'), shows: themeBlock('[data-theme="shows"]') };
const SHARED = variablesIn(TOKENS_CSS);

function parseColour(value: string | undefined): Rgba {
  const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(value ?? "");
  if (hex) {
    return {
      red: parseInt(hex[1] ?? "0", 16),
      green: parseInt(hex[2] ?? "0", 16),
      blue: parseInt(hex[3] ?? "0", 16),
      alpha: 1,
    };
  }
  const rgb = /^rgb\((\d+) (\d+) (\d+) \/ (\d+)%\)$/.exec(value ?? "");
  if (!rgb) throw new Error(`Can't parse colour ${value}`);
  return { red: Number(rgb[1]), green: Number(rgb[2]), blue: Number(rgb[3]), alpha: Number(rgb[4]) / 100 };
}

function over(top: Rgba, bottom: Rgba): Rgba {
  const mix = (upper: number, lower: number): number => upper * top.alpha + lower * (1 - top.alpha);
  return { red: mix(top.red, bottom.red), green: mix(top.green, bottom.green), blue: mix(top.blue, bottom.blue), alpha: 1 };
}

function luminance({ red, green, blue }: Rgba): number {
  const [linearRed, linearGreen, linearBlue] = [red, green, blue].map((channel) => {
    const value = channel / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * linearRed + 0.7152 * linearGreen + 0.0722 * linearBlue;
}

function contrast(first: Rgba, second: Rgba): number {
  const [lighter, darker] = [luminance(first), luminance(second)].sort((a, b) => b - a) as [number, number];
  return (lighter + 0.05) / (darker + 0.05);
}

const AA_TEXT = 4.5;
const AA_LARGE = 3;

describe("theme contract", () => {
  it("has every theme define the same variables, so a swap leaves nothing behind", () => {
    expect([...THEMES.shows.keys()].sort()).toEqual([...THEMES.movies.keys()].sort());
  });

  it("names only --theme-* variables", () => {
    for (const name of THEMES.movies.keys()) expect(name).toMatch(/^--theme-/);
  });

  it("keeps the identity colours from the specs", () => {
    expect(THEMES.movies.get("--theme-gradient-start")).toBe("#ff5f6d");
    expect(THEMES.movies.get("--theme-gradient-end")).toBe("#ffc371");
    expect(THEMES.movies.get("--theme-accent")).toBe("#ff9800");
    expect(THEMES.shows.get("--theme-gradient-start")).toBe("#2e2a7a");
    expect(THEMES.shows.get("--theme-gradient-end")).toBe("#14a3a8");
  });
});

describe.each(Object.entries(THEMES))("%s contrast", (_name, theme) => {
  const colour = (name: string): Rgba => parseColour(theme.get(name));
  const shared = (name: string): Rgba => parseColour(SHARED.get(name));
  const surfaces = ["--theme-page", "--theme-surface", "--theme-surface-muted", "--theme-surface-raised"];

  it.each(surfaces)("text and muted text pass on %s", (surface) => {
    expect(contrast(colour("--theme-text"), colour(surface))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(colour("--theme-text-muted"), colour(surface))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(surfaces)("accent text and error text pass on %s", (surface) => {
    expect(contrast(colour("--theme-accent-text"), colour(surface))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(shared("--color-error"), colour(surface))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("ink passes on a filled accent control", () => {
    expect(contrast(colour("--theme-on-accent"), colour("--theme-accent"))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(["--theme-brand-start", "--theme-brand-end"])("ink passes on a brand button at %s", (stop) => {
    expect(contrast(colour("--theme-on-brand"), colour(stop))).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(["--theme-gradient-start", "--theme-gradient-end"])("text on a scrim passes over %s", (stop) => {
    const panel = over(colour("--theme-scrim"), colour(stop));
    expect(contrast(shared("--color-on-gradient"), panel)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it.each(["--color-like", "--color-pass"])("%s works as a label on a surface and a fill under white", (swipe) => {
    expect(contrast(shared(swipe), colour("--theme-surface"))).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrast(shared(swipe), shared("--color-on-gradient"))).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it.each(surfaces)("a control's edge reaches 3:1 on %s", (surface) => {
    expect(contrast(colour("--theme-border-control"), colour(surface))).toBeGreaterThanOrEqual(AA_LARGE);
  });

  it("text on a scrim plate passes over the palest possible backdrop", () => {
    const plate = over(colour("--theme-scrim"), parseColour("#ffffff"));
    expect(contrast(shared("--color-on-gradient"), plate)).toBeGreaterThanOrEqual(AA_TEXT);
  });

  it("the brand end of the wordmark passes on the black chrome", () => {
    expect(contrast(colour("--theme-brand-start"), shared("--color-app-bar"))).toBeGreaterThanOrEqual(AA_TEXT);
  });
});

describe("where the tokens are used", () => {
  it("draws field and chip edges with the control border, not the divider", () => {
    expect(frontend("src/components/TextField.css")).toContain("border: 2px solid var(--color-border-control)");
    expect(frontend("src/components/Chip.css")).toContain("border: 1px solid var(--color-border-control)");
  });

  it("puts the featured match's label on a scrim plate", () => {
    const css = frontend("src/components/match/HistoryList.css");
    const rule = css.slice(css.indexOf(".history-stub--featured .history-stub__eyebrow"));
    expect(rule.slice(0, rule.indexOf("}"))).toContain("background: var(--color-scrim)");
  });

  it("moves phone toasts off the foot of the screen on routes with no bottom nav", () => {
    const css = frontend("src/context/ToastProvider.css");
    const rule = css.slice(css.indexOf("body:not(:has(.md-bottom-nav)) .md-toasts"));
    expect(rule.slice(0, rule.indexOf("}"))).toContain("bottom: auto");
  });

  it("gives Exact dates a hover state", () => {
    expect(frontend("src/components/filters/ReleaseRange.css")).toMatch(
      /\.release-range__exact-toggle:hover \{\s*text-decoration: underline/,
    );
  });

  it("holds the room panel's links to the touch minimum in both directions", () => {
    const css = frontend("src/components/deck/RoomPanel.css");
    const rule = css.slice(css.indexOf(".deck-room__link {"));
    const body = rule.slice(0, rule.indexOf("}"));
    expect(body).toContain("min-width: var(--touch-target)");
    expect(body).toContain("min-height: var(--touch-target)");
  });

  it("starts the Filters ticket at the top of the grid, so its max-height is what it has", () => {
    const css = frontend("src/screens/Filters.css");
    expect(css).toMatch(/\.preview-ticket \{[^}]*grid-row: 1 \/ -1/);
  });
});

describe("display font", () => {
  it("preloads the exact file the stylesheet loads", () => {
    const stylesheet = frontend("src/styles/fonts.css");
    const file = /url\("\.\/fonts\/([^"]+\.woff2)"\)/.exec(stylesheet)?.[1];

    expect(file).toBeDefined();
    expect(frontend("index.html")).toContain(`href="/src/styles/fonts/${file}"`);
  });

  it("swaps in rather than hiding headings while it loads", () => {
    expect(frontend("src/styles/fonts.css")).toContain("font-display: swap");
  });

  it("is precached, or the installed app falls back to Georgia offline", () => {
    expect(frontend("vite.config.ts")).toMatch(/globPatterns:.*woff2/);
  });
});
