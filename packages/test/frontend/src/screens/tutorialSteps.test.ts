import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MODE_COPY } from "../../../../frontend/src/mode/modeCopy";
import {
  TUTORIAL_STEPS,
  tutorialImage,
  tutorialImageName,
  type TutorialDevice,
} from "../../../../frontend/src/screens/tutorial/steps";

const IMAGE_DIR = resolve(__dirname, "../../../../frontend/src/screens/tutorial");
const DEVICES: readonly TutorialDevice[] = ["phone", "desktop"];

/** Every string a step can show in a mode, at either size. */
function wordsOf(mode: "MOVIE" | "TV"): string[] {
  const copy = MODE_COPY[mode];
  return TUTORIAL_STEPS.flatMap((step) => [
    step.title(copy),
    step.text(copy),
    step.desktopText?.(copy) ?? "",
    ...DEVICES.map((device) => step.alt(copy, device)),
  ]);
}

describe("tutorial steps", () => {
  it("are the twelve agreed steps, in order", () => {
    expect(TUTORIAL_STEPS.map(({ id }) => id)).toEqual([
      "deck",
      "details",
      "filters",
      "match",
      "invite",
      "join",
      "members",
      "settings",
      "history",
      "mode",
      "plex",
      "install",
    ]);
    expect(new Set(TUTORIAL_STEPS.map(({ id }) => id)).size).toBe(TUTORIAL_STEPS.length);
  });

  it("show the keyboard legend on the deck step only", () => {
    expect(TUTORIAL_STEPS.filter(({ keys }) => keys).map(({ id }) => id)).toEqual(["deck"]);
  });

  it("never call a show a movie in Going Steady", () => {
    // Lower case: "Movies", the mode's name, and "Movie Date", the app's, are allowed.
    for (const words of wordsOf("TV")) expect(words).not.toMatch(/movie/);
  });

  it("show the other theme's deck on the mode step", () => {
    for (const device of DEVICES) {
      expect(tutorialImageName("mode", "MOVIE", device)).toBe(`tutorial-shows-deck-${device}.webp`);
      expect(tutorialImageName("mode", "TV", device)).toBe(`tutorial-movies-deck-${device}.webp`);
    }
  });

  it("have a screenshot for every captured step, theme and size", () => {
    const missing = TUTORIAL_STEPS.filter(({ id }) => id !== "mode").flatMap(({ id }) =>
      (["MOVIE", "TV"] as const).flatMap((mode) =>
        DEVICES.filter((device) => tutorialImage(id, mode, device) === undefined).map((device) =>
          tutorialImageName(id, mode, device),
        ),
      ),
    );
    expect(missing).toEqual([]);
  });

  it("ship no screenshot that no step shows", () => {
    const expected = new Set(
      TUTORIAL_STEPS.flatMap(({ id }) =>
        (["MOVIE", "TV"] as const).flatMap((mode) => DEVICES.map((device) => tutorialImageName(id, mode, device))),
      ),
    );
    const shipped = readdirSync(IMAGE_DIR).filter((file) => file.endsWith(".webp"));
    expect(shipped.filter((file) => !expected.has(file))).toEqual([]);
  });
});
