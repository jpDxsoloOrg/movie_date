import { TextField } from "../TextField";

export interface HistorySearchProps {
  value: string;
  onChange: (value: string) => void;
}

/** Focus stays in the field while the list swaps, so this says how it went. */
export function HistoryStatus({ count }: { count: number | null }): JSX.Element {
  const text = count === null ? "" : count === 0 ? "Nothing found" : "Results updated";
  return (
    <p className="sr-only" role="status">
      {text}
    </p>
  );
}

export function HistorySearch({ value, onChange }: HistorySearchProps): JSX.Element {
  return (
    <TextField
      className="history-filters__search"
      label="Search by title"
      type="search"
      maxLength={100}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
