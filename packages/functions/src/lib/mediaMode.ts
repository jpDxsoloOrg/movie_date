import { emptyFilters, type Filters, type MediaType } from "@movie-date/core";
import type { TableKey } from "./keys.js";
import { mediaRefOfSk } from "./keys.js";
import { FIRST_ROUND, type RoomMetaItem } from "./rooms.js";

/** Both modes, movies first: that's the order room-wide work runs in. */
export const MEDIA_TYPES: readonly MediaType[] = ["MOVIE", "TV"];

type RoomRounds = Pick<RoomMetaItem, "round" | "tvRound">;

export function roundAttribute(mediaType: MediaType): "round" | "tvRound" {
  return mediaType === "TV" ? "tvRound" : "round";
}

export function roundOf(meta: RoomRounds, mediaType: MediaType): number {
  return mediaType === "TV" ? (meta.tvRound ?? FIRST_ROUND) : meta.round;
}

export function filtersOf(
  meta: Pick<RoomMetaItem, "filters" | "tvFilters">,
  mediaType: MediaType,
): Filters {
  return (mediaType === "TV" ? meta.tvFilters : meta.filters) ?? emptyFilters();
}

/**
 * A condition on `#round` holding `:round`. A room with no `tvRound` is on its
 * first, and an absent attribute fails any comparison, so that has to be spelled out.
 */
export function roundCondition(mediaType: MediaType, round: number): string {
  return mediaType === "TV" && round === FIRST_ROUND
    ? "attribute_not_exists(#round) OR #round = :round"
    : "#round = :round";
}

/** `round` and `tvRound` overlap, so a scan of round 3 returns both modes' rows. */
export function inMode(mediaType: MediaType): (row: TableKey) => boolean {
  return (row) => mediaRefOfSk(row.sk).mediaType === mediaType;
}
