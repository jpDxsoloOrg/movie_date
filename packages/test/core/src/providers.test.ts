import {
  buildDiscoverQuery,
  emptyFilters,
  findProvider,
  isServiceKey,
  PROVIDERS,
  providerIdsForServices,
  selectableProviders,
} from "@movie-date/core";
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
      plex: [],
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

  it("offers Plex only to a room that has it", () => {
    const keys = (plexAvailable: boolean) =>
      selectableProviders(plexAvailable).map((provider) => provider.key);
    expect(keys(true)).toContain("plex");
    expect(keys(false)).not.toContain("plex");
    expect(keys(false)).toContain("netflix");
  });

  it("never sends Plex to TMDB", () => {
    const query = buildDiscoverQuery({ ...emptyFilters(), services: ["plex", "netflix"] }, 1);
    expect(query.with_watch_providers).toBe("8");
    expect(buildDiscoverQuery({ ...emptyFilters(), services: ["plex"] }, 1)).not.toHaveProperty(
      "with_watch_providers",
    );
  });
});
