import { defaultReleaseDateGte } from "@movie-date/core";
import { useId, useState } from "react";
import { Chip } from "../Chip";
import { TextField } from "../TextField";
import { FilterSection } from "./FilterSection";
import {
  MAX_DATE,
  MIN_DATE,
  endYear,
  isPickActive,
  longDate,
  needsExactDates,
  pressPick,
  rangeLabel,
  releasePicks,
  startYear,
  withEndYear,
  withStartYear,
  yearChoices,
  type RangeDefault,
  type ReleaseDates,
} from "./releaseRange";
import "./ReleaseRange.css";

interface YearSelectProps {
  label: string;
  value: string;
  years: number[];
  emptyLabel: string;
  invalid?: boolean;
  onChange: (year: string) => void;
}

/** A list can't hold a half-typed year, and a native picker can't outgrow its column. */
function YearSelect({ label, value, years, emptyLabel, invalid, onChange }: YearSelectProps): JSX.Element {
  const selectId = useId();
  return (
    <div className="md-field">
      <label className="md-field__label" htmlFor={selectId}>
        {label}
      </label>
      <div className="md-field__control release-range__select">
        <select
          id={selectId}
          className={invalid ? "md-field__input md-field__input--error" : "md-field__input"}
          aria-invalid={invalid ? true : undefined}
          value={value}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">{emptyLabel}</option>
          {years.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}

export interface ReleaseRangeProps {
  /** Shows use first-air dates under another name. */
  title: string;
  dates: ReleaseDates;
  error: string | null;
  /** What leaving it empty means. */
  rangeDefault?: RangeDefault;
  onChange: (dates: ReleaseDates) => void;
}

export function ReleaseRange({
  title,
  dates,
  error,
  rangeDefault = "this-year",
  onChange,
}: ReleaseRangeProps): JSX.Element {
  const now = new Date();
  const defaultStart = defaultReleaseDateGte(now);
  const [exactOpen, setExactOpen] = useState(() => needsExactDates(dates));
  const years = yearChoices(now, dates);
  const defaultLabel = rangeDefault === "this-year" ? "This year" : "Any time";

  return (
    <FilterSection title={title} meta={rangeLabel(dates, now, rangeDefault) ?? defaultLabel}>
      <div className="release-range__picks" role="group" aria-label="Quick picks">
        {releasePicks(now, rangeDefault).map((pick) => (
          <Chip
            key={pick.id}
            label={pick.label}
            selected={isPickActive(pick, dates, now, rangeDefault)}
            onClick={() => onChange(pressPick(pick, dates, now))}
          />
        ))}
      </div>
      <p className="release-range__tip">Press a second decade to span the years between.</p>

      <div className="release-range__fields">
        <YearSelect
          label="From"
          value={startYear(dates)}
          years={years}
          emptyLabel={rangeDefault === "this-year" ? "This year" : "Any year"}
          onChange={(year) => onChange({ ...dates, releaseDateGte: withStartYear(year) })}
        />
        <YearSelect
          label="To"
          value={endYear(dates)}
          years={years}
          emptyLabel="Any year"
          invalid={Boolean(error)}
          onChange={(year) => onChange({ ...dates, releaseDateLte: withEndYear(year) })}
        />
      </div>

      {error && !exactOpen && (
        <p className="release-range__error" role="alert">
          {error}
        </p>
      )}

      <details
        className="release-range__exact"
        open={exactOpen}
        onToggle={(event) => setExactOpen(event.currentTarget.open)}
      >
        <summary className="release-range__exact-toggle">Exact dates</summary>
        <div className="release-range__fields release-range__fields--dates">
          <TextField
            label="Start"
            type="date"
            min={MIN_DATE}
            max={MAX_DATE}
            value={dates.releaseDateGte ?? ""}
            hint={dates.releaseDateGte || rangeDefault !== "this-year" ? undefined : `Defaults to ${longDate(defaultStart)}`}
            onChange={(event) => onChange({ ...dates, releaseDateGte: event.target.value || null })}
          />
          <TextField
            label="End"
            type="date"
            min={MIN_DATE}
            max={MAX_DATE}
            value={dates.releaseDateLte ?? ""}
            error={error}
            onChange={(event) => onChange({ ...dates, releaseDateLte: event.target.value || null })}
          />
        </div>
      </details>
    </FilterSection>
  );
}
