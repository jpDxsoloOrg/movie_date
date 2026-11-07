import type { FilterPreviewState } from "./useFilterPreview";
import "./FilterCount.css";

export interface ItemNoun {
  one: string;
  other: string;
}

export interface FilterCountProps {
  preview: FilterPreviewState;
  noun: ItemNoun;
  /** Why Apply won't work right now. Replaces the count. */
  problem: string | null;
}

/** TMDB stops counting just past this, so a higher figure only says there are at least this many. */
export const COUNT_CEILING = 20_000;

function headline({ firstLoad, totalResults }: FilterPreviewState, noun: ItemNoun): string {
  if (totalResults === 0) return `No ${noun.other} match`;
  if (totalResults !== null && totalResults >= COUNT_CEILING) {
    return `${COUNT_CEILING.toLocaleString()}+ ${noun.other}`;
  }
  if (totalResults !== null) {
    return `About ${totalResults.toLocaleString()} ${totalResults === 1 ? noun.one : noun.other}`;
  }
  return firstLoad ? "Counting…" : "Ready when you are";
}

export function FilterCount({ preview, noun, problem }: FilterCountProps): JSX.Element {
  const classes = [
    "filter-count",
    problem && "filter-count--problem",
    preview.stale && !problem && "filter-count--stale",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <p className={classes} role="status">
      {problem ?? headline(preview, noun)}
    </p>
  );
}
