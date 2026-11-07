import { describe, expect, it } from "vitest";
import {
  MIN_DATE,
  isDefaultRange,
  isPickActive,
  needsExactDates,
  pressPick,
  rangeLabel,
  releaseDateError,
  releasePicks,
  yearChoices,
  type ReleaseDates,
  type ReleasePick,
} from "../../../../../frontend/src/components/filters/releaseRange";

const now = new Date(2026, 10, 7);
const none: ReleaseDates = { releaseDateGte: null, releaseDateLte: null };

function pick(label: string): ReleasePick {
  const found = releasePicks(now).find((item) => item.label === label);
  if (!found) throw new Error(`No pick called ${label}`);
  return found;
}

describe("release picks", () => {
  it("runs from this year back through the decades to the classics", () => {
    expect(releasePicks(now).map((item) => item.label)).toEqual([
      "This year",
      "2020s",
      "2010s",
      "2000s",
      "1990s",
      "1980s",
      "1970s",
      "Before 1970",
      "All time",
    ]);
  });

  it("moves on with the calendar", () => {
    expect(releasePicks(new Date(2031, 0, 1))[1]?.label).toBe("2030s");
  });
});

describe("pressPick", () => {
  it("sets a decade on an empty range", () => {
    expect(pressPick(pick("1990s"), none, now)).toEqual({
      releaseDateGte: "1990-01-01",
      releaseDateLte: "1999-12-31",
    });
  });

  it("clears a lone decade pressed again", () => {
    expect(pressPick(pick("1990s"), pick("1990s").dates, now)).toEqual(none);
  });

  it("stretches to a second decade in either direction", () => {
    const nineties = pick("1990s").dates;
    expect(pressPick(pick("2010s"), nineties, now)).toEqual({
      releaseDateGte: "1990-01-01",
      releaseDateLte: "2019-12-31",
    });
    expect(pressPick(pick("1970s"), nineties, now)).toEqual({
      releaseDateGte: "1970-01-01",
      releaseDateLte: "1999-12-31",
    });
  });

  it("narrows to a decade pressed inside a span", () => {
    const span = { releaseDateGte: "1990-01-01", releaseDateLte: "2019-12-31" };
    expect(pressPick(pick("2000s"), span, now)).toEqual(pick("2000s").dates);
  });

  it("replaces a hand-entered range rather than stretching it", () => {
    const typed = { releaseDateGte: "1993-05-01", releaseDateLte: "1994-06-01" };
    expect(pressPick(pick("2000s"), typed, now)).toEqual(pick("2000s").dates);
  });

  it("All time and This year always replace the range", () => {
    const span = pick("1990s").dates;
    expect(pressPick(pick("All time"), span, now)).toEqual({ releaseDateGte: MIN_DATE, releaseDateLte: null });
    expect(pressPick(pick("This year"), span, now)).toEqual(none);
  });
});

describe("isPickActive", () => {
  it("lights every decade inside a span and none outside", () => {
    const span = { releaseDateGte: "1990-01-01", releaseDateLte: "2009-12-31" };
    expect(isPickActive(pick("1990s"), span, now)).toBe(true);
    expect(isPickActive(pick("2000s"), span, now)).toBe(true);
    expect(isPickActive(pick("2010s"), span, now)).toBe(false);
    expect(isPickActive(pick("This year"), span, now)).toBe(false);
  });

  it("treats the empty range and the saved default as This year", () => {
    expect(isPickActive(pick("This year"), none, now)).toBe(true);
    expect(isPickActive(pick("This year"), { releaseDateGte: "2026-01-01" }, now)).toBe(true);
    expect(isDefaultRange({ releaseDateGte: "2026-01-01", releaseDateLte: "2026-06-01" }, now)).toBe(false);
  });

  it("only lights All time when nothing bounds the end", () => {
    expect(isPickActive(pick("All time"), { releaseDateGte: MIN_DATE }, now)).toBe(true);
    expect(isPickActive(pick("All time"), { releaseDateGte: MIN_DATE, releaseDateLte: "1959-12-31" }, now)).toBe(false);
  });
});

describe("rangeLabel", () => {
  it.each([
    [none, null],
    [{ releaseDateGte: "2026-01-01" }, null],
    [{ releaseDateGte: "1990-01-01", releaseDateLte: "1999-12-31" }, "1990s"],
    [{ releaseDateGte: "1990-01-01", releaseDateLte: "2009-12-31" }, "1990–2009"],
    [{ releaseDateGte: "1999-01-01", releaseDateLte: "1999-12-31" }, "1999"],
    [{ releaseDateGte: "1984-01-01" }, "From 1984"],
    [{ releaseDateLte: "2027-12-31" }, "Until 2027"],
    [{ releaseDateGte: MIN_DATE }, "All time"],
    [{ releaseDateGte: MIN_DATE, releaseDateLte: "1969-12-31" }, "Before 1970"],
  ])("%j reads as %s", (dates, label) => {
    expect(rangeLabel(dates, now)).toBe(label);
  });

  it("spells out dates that aren't whole years", () => {
    const label = rangeLabel({ releaseDateGte: "1999-03-31", releaseDateLte: "2001-02-03" }, now);
    expect(label).toContain("1999");
    expect(label).toContain("to");
    expect(rangeLabel({ releaseDateGte: "1999-03-31" }, now)).toMatch(/^From .*1999/);
  });
});

describe("yearChoices", () => {
  it("is newest first, from just ahead of now back to 1900", () => {
    const years = yearChoices(now, none);
    expect(years[0]).toBe(2028);
    expect(years[years.length - 1]).toBe(1900);
  });

  it("keeps a saved year outside that span", () => {
    expect(yearChoices(now, { releaseDateLte: "2090-12-31" })[0]).toBe(2090);
  });
});

describe("validation and exact dates", () => {
  it("compares the end with the default start when none is picked", () => {
    expect(releaseDateError({ releaseDateLte: "2025-06-01" }, now)).toContain("Jan 1, 2026");
    expect(releaseDateError({ releaseDateGte: "2020-01-01", releaseDateLte: "2025-06-01" }, now)).toBeNull();
    expect(releaseDateError(none, now)).toBeNull();
  });

  it("wants the exact fields only for mid-year dates", () => {
    expect(needsExactDates(none)).toBe(false);
    expect(needsExactDates({ releaseDateGte: "1990-01-01", releaseDateLte: "1999-12-31" })).toBe(false);
    expect(needsExactDates({ releaseDateGte: "1990-02-01" })).toBe(true);
    expect(needsExactDates({ releaseDateLte: "1999-06-30" })).toBe(true);
  });
});

describe("a range that defaults to any time", () => {
  const anyPick = (label: string): ReleasePick => {
    const found = releasePicks(now, "any-time").find((item) => item.label === label);
    if (!found) throw new Error(`No pick called ${label}`);
    return found;
  };

  it("swaps This year and All time for one Any time pick", () => {
    const labels = releasePicks(now, "any-time").map((item) => item.label);
    expect(labels[0]).toBe("Any time");
    expect(labels).not.toContain("This year");
    expect(labels).not.toContain("All time");
  });

  it("treats only an empty range as the default", () => {
    expect(isDefaultRange(none, now, "any-time")).toBe(true);
    expect(isDefaultRange({ releaseDateGte: "2026-01-01", releaseDateLte: null }, now, "any-time")).toBe(false);
    expect(isPickActive(anyPick("Any time"), none, now, "any-time")).toBe(true);
  });

  it("labels this year's start as a real choice, not the default", () => {
    expect(rangeLabel({ releaseDateGte: "2026-01-01", releaseDateLte: null }, now, "any-time")).toBe("From 2026");
    expect(rangeLabel(none, now, "any-time")).toBeNull();
  });

  it("allows an end date with no start, which this year's default would refuse", () => {
    const dates: ReleaseDates = { releaseDateGte: null, releaseDateLte: "2015-12-31" };
    expect(releaseDateError(dates, now)).not.toBeNull();
    expect(releaseDateError(dates, now, "any-time")).toBeNull();
  });

  it("still refuses an end before the start", () => {
    const dates: ReleaseDates = { releaseDateGte: "2020-01-01", releaseDateLte: "2015-12-31" };
    expect(releaseDateError(dates, now, "any-time")).not.toBeNull();
  });
});
