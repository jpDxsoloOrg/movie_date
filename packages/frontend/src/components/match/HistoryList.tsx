import type { ReactNode } from "react";
import { errorMessage } from "../../services/api";
import { Button } from "../Button";
import { SkeletonList } from "../Skeleton";
import { ErrorState } from "../StateMessage";
import type { PagedList } from "./usePagedList";
import "./HistoryList.css";

export interface HistoryListProps<TItem> {
  list: PagedList<TItem>;
  label: string;
  empty: ReactNode;
  itemKey: (item: TItem) => string;
  renderItem: (item: TItem) => ReactNode;
}

export function HistoryList<TItem>({ list, label, empty, itemKey, renderItem }: HistoryListProps<TItem>): JSX.Element {
  const { items, error, loading, reload, hasMore, loadingMore, loadMore } = list;

  if (!items) {
    if (error && !loading) return <ErrorState message={errorMessage(error)} onRetry={() => void reload()} />;
    return <SkeletonList rows={6} />;
  }
  if (items.length === 0) return <>{empty}</>;

  return (
    <>
      <ul className="history-list" aria-label={label}>
        {items.map((item) => (
          <li key={itemKey(item)}>{renderItem(item)}</li>
        ))}
      </ul>
      {hasMore && (
        <Button
          className="history-list__more"
          variant="secondary"
          block
          loading={loadingMore}
          onClick={() => void loadMore()}
        >
          Load more
        </Button>
      )}
    </>
  );
}
