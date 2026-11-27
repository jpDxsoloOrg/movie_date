import { castSearchDraft, localIsoDate } from "@movie-date/frontend/components/filters/castSearch";
import type { Room } from "@movie-date/frontend/services/api";
import { describe, expect, it } from "vitest";

const al = { id: 1158, name: "Al Pacino", profileUrl: null, knownForDepartment: "Acting" };
const bob = { id: 380, name: "Robert De Niro", profileUrl: null, knownForDepartment: "Acting" };

describe("localIsoDate", () => {
  it("uses the local calendar day, not UTC's", () => {
    // 11pm locally is already tomorrow in UTC for anyone west of Greenwich.
    expect(localIsoDate(new Date(2026, 10, 27, 23, 30))).toBe("2026-11-27");
  });

  it("pads single-digit months and days", () => {
    expect(localIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});

describe("castSearchDraft", () => {
  const filters: Room["filters"] = {
    genreIds: [80],
    services: ["netflix"],
    cast: [bob],
    releaseDateGte: "2020-01-01",
    releaseDateLte: "2020-12-31",
  };

  it("searches the cast from 1970 to today, keeping genres and services", () => {
    expect(castSearchDraft(filters, [al], new Date(2026, 10, 27))).toEqual({
      genreIds: [80],
      services: ["netflix"],
      cast: [al],
      releaseDateGte: "1970-01-01",
      releaseDateLte: "2026-11-27",
    });
  });

  it("doesn't share the cast list it was given", () => {
    const cast = [al];
    const draft = castSearchDraft(filters, cast, new Date(2026, 10, 27));
    cast.push(bob);
    expect(draft.cast).toEqual([al]);
  });
});
