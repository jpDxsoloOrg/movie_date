import { useNavigate } from "react-router-dom";
import { api, type HistoryEntry, type MediaType } from "../../services/api";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { EmptyState } from "../StateMessage";
import { MODE_COPY } from "../../mode/modeCopy";
import { homePath, MOVIES_STATE } from "../../mode/modeRoutes";
import { formatHistoryDate, HISTORY_PAGE_SIZE, yearsLabel } from "./historyFormat";
import { HistoryList } from "./HistoryList";
import { MoviePoster } from "./MoviePoster";
import { usePagedList } from "./usePagedList";

function SwipeRow({ entry }: { entry: HistoryEntry }): JSX.Element {
  const liked = entry.direction === "LIKE";
  const copy = MODE_COPY[entry.mediaType];
  const years = yearsLabel(entry);
  return (
    <div className={`history-row history-row--${liked ? "like" : "pass"}`}>
      <MoviePoster
        className="history-row__poster"
        posterUrl={entry.movie.posterUrl}
        alt=""
        thumbnail
        sizes="3.5rem"
        mediaType={entry.mediaType}
      />
      <span className="history-row__text">
        <span className="history-row__title">{entry.movie.title}</span>
        <span className="history-row__detail">
          <span className={`history-row__direction history-row__direction--${liked ? "like" : "pass"}`}>
            <Icon name={liked ? "heart" : "close"} />
            {liked ? copy.likedLabel : copy.passedLabel}
          </span>
          {years && <span className="history-row__years">{years}</span>}
          <span className="history-row__stamp">
            {formatHistoryDate(entry.swipedAt)} · Round&nbsp;{entry.round}
          </span>
        </span>
      </span>
    </div>
  );
}

export function SwipeHistory({ mediaType = "MOVIE" }: { mediaType?: MediaType }): JSX.Element {
  const navigate = useNavigate();
  const list = usePagedList<HistoryEntry>(async (nextToken) => {
    const page = await api.swipeHistory({ limit: HISTORY_PAGE_SIZE, nextToken }, mediaType);
    return { items: page.entries, nextToken: page.nextToken ?? null };
  });

  return (
    <HistoryList
      list={list}
      label="Your swipes"
      layout="rows"
      itemKey={(entry) => `${entry.round}-${entry.movie.id}`}
      empty={
        <EmptyState
          title="No swipes yet"
          message={MODE_COPY[mediaType].noSwipesMessage}
          icon="history"
          action={<Button onClick={() => navigate(homePath(mediaType), { state: mediaType === "MOVIE" ? MOVIES_STATE : undefined })}>Start swiping</Button>}
        />
      }
      renderItem={(entry) => <SwipeRow entry={entry} />}
    />
  );
}
