import { useEffect, useState } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { api, type FiltersInput } from "../../services/api";

const DEBOUNCE_MS = 350;

export interface FilterPreviewState {
  /** Null when there's no count to give, including when the call failed. */
  totalResults: number | null;
  posterUrls: string[];
  /** Nothing to show yet. */
  firstLoad: boolean;
  /** What's showing is for an earlier version of the draft. */
  stale: boolean;
}

/** Pass null to pause, while the draft is one that couldn't be saved. */
export function useFilterPreview(filters: FiltersInput | null): FilterPreviewState {
  const [settled, setSettled] = useState(filters);
  const draftKey = JSON.stringify(filters);
  const settledKey = JSON.stringify(settled);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(filters), DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // `filters` is rebuilt every render; its key says when it really changed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftKey]);

  const { data, error, loading } = useAsyncData(
    async () => (settled ? api.filterPreview(settled) : null),
    [settledKey],
  );
  const usable = error ? null : data;

  return {
    totalResults: usable?.totalResults ?? null,
    posterUrls: usable?.posterUrls ?? [],
    firstLoad: loading && !data,
    stale: loading || draftKey !== settledKey,
  };
}
