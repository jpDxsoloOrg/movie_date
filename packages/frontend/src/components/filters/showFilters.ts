import { COMMITMENT_SEASONS } from "@movie-date/core";
import type { CommitmentLevel, ShowStatusFilter } from "../../gql/graphql";

export const SHOW_STATUS_CHOICES: readonly { value: ShowStatusFilter; label: string }[] = [
  { value: "RUNNING", label: "Still Running" },
  { value: "FINISHED", label: "Finished" },
];

export const COMMITMENT_CHOICES: readonly { value: CommitmentLevel; label: string }[] = [
  { value: "SHORT_AND_SWEET", label: "Short and Sweet" },
  { value: "A_FEW_SEASONS", label: "A Few Seasons" },
  { value: "LONG_HAUL", label: "Long Haul" },
];

export function showStatusLabel(status: ShowStatusFilter): string {
  return SHOW_STATUS_CHOICES.find((choice) => choice.value === status)?.label ?? status;
}

export function commitmentLabel(level: CommitmentLevel): string {
  return COMMITMENT_CHOICES.find((choice) => choice.value === level)?.label ?? level;
}

/** "1–2 seasons" or "6+ seasons", straight from the ranges the deck applies. */
export function commitmentSeasons(level: CommitmentLevel): string {
  const { min, max } = COMMITMENT_SEASONS[level];
  return max === null ? `${min}+ seasons` : `${min}–${max} seasons`;
}
