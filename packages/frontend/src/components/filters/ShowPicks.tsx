import type { CommitmentLevel, ShowStatusFilter } from "../../gql/graphql";
import { Chip } from "../Chip";
import { FilterSection } from "./FilterSection";
import {
  COMMITMENT_CHOICES,
  SHOW_STATUS_CHOICES,
  commitmentLabel,
  commitmentSeasons,
  showStatusLabel,
} from "./showFilters";
import "./ShowPicks.css";

export interface ShowStatusPickerProps {
  value: ShowStatusFilter | null | undefined;
  onChange: (status: ShowStatusFilter | null) => void;
}

export function ShowStatusPicker({ value, onChange }: ShowStatusPickerProps): JSX.Element {
  return (
    <FilterSection title="Status" meta={value ? showStatusLabel(value) : "Any status"}>
      <div className="show-picks" role="group" aria-label="Status">
        {SHOW_STATUS_CHOICES.map((choice) => (
          <Chip
            key={choice.value}
            label={choice.label}
            selected={value === choice.value}
            onClick={() => onChange(value === choice.value ? null : choice.value)}
          />
        ))}
      </div>
    </FilterSection>
  );
}

export interface CommitmentPickerProps {
  value: CommitmentLevel | null | undefined;
  onChange: (level: CommitmentLevel | null) => void;
}

export function CommitmentPicker({ value, onChange }: CommitmentPickerProps): JSX.Element {
  return (
    <FilterSection title="Commitment Level" meta={value ? commitmentSeasons(value) : "Any length"}>
      <div className="show-picks" role="group" aria-label="Commitment Level">
        {COMMITMENT_CHOICES.map((choice) => (
          <Chip
            key={choice.value}
            label={`${commitmentLabel(choice.value)}, ${commitmentSeasons(choice.value)}`}
            selected={value === choice.value}
            onClick={() => onChange(value === choice.value ? null : choice.value)}
          />
        ))}
      </div>
    </FilterSection>
  );
}
