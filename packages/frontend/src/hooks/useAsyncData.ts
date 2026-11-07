import { useCallback, useEffect, useRef, useState, type DependencyList } from "react";

export interface AsyncData<TData> {
  data: TData | undefined;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  /** Replace the data locally, e.g. with a mutation's result. */
  setData: (data: TData) => void;
}

/**
 * Runs `load` on mount and whenever `deps` change. A reload keeps showing the
 * old data; a result that lost a race to a newer run is dropped.
 */
export function useAsyncData<TData>(load: () => Promise<TData>, deps: DependencyList): AsyncData<TData> {
  const [data, setData] = useState<TData>();
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const latestRun = useRef(0);
  const latestLoad = useRef(load);
  latestLoad.current = load;

  const reload = useCallback(async () => {
    latestRun.current += 1;
    const run = latestRun.current;
    setLoading(true);
    setError(null);
    try {
      const result = await latestLoad.current();
      if (run === latestRun.current) setData(result);
    } catch (caught) {
      if (run === latestRun.current) setError(caught);
    } finally {
      if (run === latestRun.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    return () => {
      latestRun.current += 1;
    };
    // `deps` is the caller's list; `reload` is stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}
