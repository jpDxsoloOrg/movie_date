import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useRoom } from "../../hooks/useRoom";
import { api, type HistoryEntry, type MediaType, type SwipeDirection } from "../../services/api";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { SegmentedControl } from "../SegmentedControl";
import { EmptyState } from "../StateMessage";
import { MODE_COPY } from "../../mode/modeCopy";
import { homePath, MOVIES_STATE } from "../../mode/modeRoutes";
import { ClearHistory } from "./ClearHistory";
import { formatHistoryDate, HISTORY_PAGE_SIZE, SEARCH_DELAY_MS, yearsLabel } from "./historyFormat";
import { HistoryList } from "./HistoryList";
import { HistorySearch, HistoryStatus } from "./HistorySearch";
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

type DirectionFilter = "ALL" | SwipeDirection;

interface SwipeListProps {
  mediaType: MediaType;
  search: string;
  direction: DirectionFilter;
  onCleared: () => void;
  onLoaded: (count: number) => void;
}

/** Remounted for each filter, so a page still loading can't land in the next list. */
function SwipeList({ mediaType, search, direction, onCleared, onLoaded }: SwipeListProps): JSX.Element {
  const navigate = useNavigate();
  const { room } = useRoom();
  const solo = room.members.length === 1;
  const filtered = search !== "" || direction !== "ALL";
  const list = usePagedList<HistoryEntry>(async (nextToken) => {
    const page = await api.swipeHistory(
      {
        limit: HISTORY_PAGE_SIZE,
        nextToken,
        search: search || undefined,
        direction: direction === "ALL" ? undefined : direction,
      },
      mediaType,
    );
    return { items: page.entries, nextToken: page.nextToken ?? null };
  });
  const count = list.items?.length;
  useEffect(() => {
    if (count !== undefined) onLoaded(count);
  }, [count, onLoaded]);

  return (
    <>
      <HistoryList
        list={list}
        label="Your swipes"
        layout="rows"
        itemKey={(entry) => `${entry.round}-${entry.movie.id}`}
        empty={
          filtered ? (
            <EmptyState title="No swipes found" message="Nothing here fits those filters." icon="history" />
          ) : (
            <EmptyState
              title="No swipes yet"
              message={MODE_COPY[mediaType].noSwipesMessage}
              icon="history"
              action={<Button onClick={() => navigate(homePath(mediaType), { state: mediaType === "MOVIE" ? MOVIES_STATE : undefined })}>Start swiping</Button>}
            />
          )
        }
        renderItem={(entry) => <SwipeRow entry={entry} />}
      />
      {/* Alone, the reset sits above the list instead, where nobody has to scroll for it. */}
      {!solo && !filtered && (count ?? 0) > 0 && (
        <ClearHistory kind="SWIPES" mediaType={mediaType} onCleared={onCleared} />
      )}
    </>
  );
}

export function SwipeHistory({ mediaType = "MOVIE" }: { mediaType?: MediaType }): JSX.Element {
  const { room } = useRoom();
  const solo = room.members.length === 1;
  const [search, setSearch] = useState("");
  const [direction, setDirection] = useState<DirectionFilter>("ALL");
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<number | null>(null);
  const settled = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);
  const copy = MODE_COPY[mediaType];
  const filters = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (version > 0) filters.current?.focus();
  }, [version]);
  const directions: readonly { value: DirectionFilter; label: string }[] = [
    { value: "ALL", label: "All" },
    { value: "LIKE", label: copy.likedLabel },
    { value: "PASS", label: copy.passedLabel },
  ];

  return (
    <>
      {/* Always on offer alone, even with an empty list: an earlier clear can hide swipes that still count. */}
      {solo && (
        <ClearHistory
          kind="SWIPES"
          mediaType={mediaType}
          solo
          placement="top"
          onCleared={() => setVersion((current) => current + 1)}
        />
      )}
      <div ref={filters} className="history-filters" data-tour="history-reset" tabIndex={-1}>
        <HistorySearch value={search} onChange={setSearch} />
        <HistoryStatus count={settled || direction !== "ALL" ? loaded : null} />
        <SegmentedControl label="Show swipes" options={directions} value={direction} onChange={setDirection} block />
      </div>
      <SwipeList
        key={`${version}:${direction}:${settled}`}
        mediaType={mediaType}
        search={settled}
        direction={direction}
        onCleared={() => setVersion((current) => current + 1)}
        onLoaded={setLoaded}
      />
    </>
  );
}
