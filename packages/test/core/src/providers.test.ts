import { findProvider, isServiceKey, PROVIDERS, providerIdsForServices } from "@movie-date/core";
import { describe, expect, it } from "vitest";

describe("provider catalogue", () => {
  it("carries the spec's TMDB ids", () => {
    const ids = Object.fromEntries(
      PROVIDERS.map((provider) => [provider.key, provider.tmdbProviderIds]),
    );
    expect(ids).toEqual({
      any: [],
      tubi: [73],
      prime: [9],
      netflix: [8],
      hulu: [15],
      hbo: [1899],
      apple: [350],
      disney: [337],
      paramount: [531, 1770, 1853],
      peacock: [386],
    });
  });

  it("looks services up by key", () => {
    expect(findProvider("hbo")?.icon).toBe("/icons/max.png");
    expect(isServiceKey("netflix")).toBe(true);
    expect(isServiceKey("blockbuster")).toBe(false);
  });

  it("removes duplicate provider ids", () => {
    expect(providerIdsForServices(["hulu", "hulu"])).toEqual([15]);
  });
});
