import type { ReactNode } from "react";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { errorMessage } from "../../services/api";
import { Button } from "../Button";
import { SkeletonList, SkeletonPosterGrid } from "../Skeleton";
import { ErrorState } from "../StateMessage";
import type { PagedList } from "./usePagedList";
import "./HistoryList.css";

export type HistoryLayout = "wall" | "rows";

export interface HistoryListProps<TItem> {
  list: PagedList<TItem>;
  label: string;
  /** `wall` becomes a poster wall from 640px; `rows` stays a list and adds columns. */
  layout: HistoryLayout;
  empty: ReactNode;
  itemKey: (item: TItem) => string;
  renderItem: (item: TItem, index: number) => ReactNode;
}

export function HistoryList<TItem>({
  list,
  label,
  layout,
  empty,
  itemKey,
  renderItem,
}: HistoryListProps<TItem>): JSX.Element {
  const { items, error, loading, reload, hasMore, loadingMore, loadMore } = list;
  const breakpoint = useBreakpoint();
  const posterSkeleton = layout === "wall" && breakpoint !== "mobile";

  if (!items) {
    if (error && !loading) return <ErrorState message={errorMessage(error)} onRetry={() => void reload()} />;
    return posterSkeleton ? <SkeletonPosterGrid count={8} /> : <SkeletonList rows={6} />;
  }
  if (items.length === 0) return <>{empty}</>;

  return (
    <>
      <ul className={`history-list history-list--${layout}`} aria-label={label}>
        {items.map((item, index) => (
          <li key={itemKey(item)}>{renderItem(item, index)}</li>
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
