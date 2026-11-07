import { useState } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../services/api";

export interface ListPage<TItem> {
  items: TItem[];
  nextToken: string | null;
}

export interface PagedList<TItem> {
  items: TItem[] | undefined;
  error: unknown;
  loading: boolean;
  reload: () => Promise<void>;
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
}

/** Loads the first page on mount. A failed later page keeps what's shown, so the button is the retry. */
export function usePagedList<TItem>(loadPage: (nextToken: string | null) => Promise<ListPage<TItem>>): PagedList<TItem> {
  const toast = useToast();
  const { data, error, loading, reload, setData } = useAsyncData(() => loadPage(null), []);
  const [loadingMore, setLoadingMore] = useState(false);

  async function loadMore(): Promise<void> {
    if (!data?.nextToken) return;
    setLoadingMore(true);
    try {
      const next = await loadPage(data.nextToken);
      setData({ items: [...data.items, ...next.items], nextToken: next.nextToken });
    } catch (caught) {
      toast.error(errorMessage(caught));
    } finally {
      setLoadingMore(false);
    }
  }

  return {
    items: data?.items,
    error,
    loading,
    reload,
    hasMore: Boolean(data?.nextToken),
    loadingMore,
    loadMore,
  };
}
