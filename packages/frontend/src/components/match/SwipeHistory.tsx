import { useNavigate } from "react-router-dom";
import { api, type HistoryEntry } from "../../services/api";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { EmptyState } from "../StateMessage";
import { formatHistoryDate, HISTORY_PAGE_SIZE, movieLabel } from "./historyFormat";
import { HistoryList } from "./HistoryList";
import { MoviePoster } from "./MoviePoster";
import { usePagedList } from "./usePagedList";

function SwipeRow({ entry }: { entry: HistoryEntry }): JSX.Element {
  const liked = entry.direction === "LIKE";
  return (
    <div className="history-row">
      <MoviePoster className="history-row__poster" posterUrl={entry.movie.posterUrl} alt="" thumbnail />
      <span className="history-row__text">
        <span className="history-row__title">{movieLabel(entry.movie)}</span>
        <span className="history-row__detail">
          <span className={`history-row__direction history-row__direction--${liked ? "like" : "pass"}`}>
            <Icon name={liked ? "heart" : "close"} />
            {liked ? "Liked" : "Passed"}
          </span>
          <span>
            {formatHistoryDate(entry.swipedAt)} · Round&nbsp;{entry.round}
          </span>
        </span>
      </span>
    </div>
  );
}

export function SwipeHistory(): JSX.Element {
  const navigate = useNavigate();
  const list = usePagedList<HistoryEntry>(async (nextToken) => {
    const page = await api.swipeHistory({ limit: HISTORY_PAGE_SIZE, nextToken });
    return { items: page.entries, nextToken: page.nextToken ?? null };
  });

  return (
    <HistoryList
      list={list}
      label="Your swipes"
      itemKey={(entry) => `${entry.round}-${entry.movie.id}`}
      empty={
        <EmptyState
          title="No swipes yet"
          message="Movies you like or pass on in this room will show up here."
          action={<Button onClick={() => navigate("/")}>Start swiping</Button>}
        />
      }
      renderItem={(entry) => <SwipeRow entry={entry} />}
    />
  );
}
