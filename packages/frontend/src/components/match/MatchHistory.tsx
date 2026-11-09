import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { api, type Match, type MediaType } from "../../services/api";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { EmptyState } from "../StateMessage";
import { MODE_COPY } from "../../mode/modeCopy";
import { homePath, MOVIES_STATE } from "../../mode/modeRoutes";
import { ClearHistory } from "./ClearHistory";
import { HISTORY_PAGE_SIZE, matchStamp, SEARCH_DELAY_MS, titleLabel } from "./historyFormat";
import { HistoryList } from "./HistoryList";
import { HistorySearch, HistoryStatus } from "./HistorySearch";
import { MatchDetails } from "./MatchDetails";
import { MoviePoster } from "./MoviePoster";
import { usePagedList } from "./usePagedList";

const STUB_POSTER_SIZES = "(min-width: 640px) 15rem, 4.5rem";

interface MatchStubProps {
  match: Match;
  /** The newest match on a desktop wall, drawn large over its backdrop. */
  featured: boolean;
  onOpen: () => void;
}

function MatchStub({ match, featured, onOpen }: MatchStubProps): JSX.Element {
  const { movie } = match;
  return (
    <button
      type="button"
      className={featured ? "history-stub history-stub--featured" : "history-stub"}
      onClick={onOpen}
    >
      {/* The mask is on this inner layer: on the button it would cut off the focus ring. */}
      <span className="history-stub__card">
        <MoviePoster
          className="history-stub__poster"
          posterUrl={featured ? (movie.backdropUrl ?? movie.posterUrl) : movie.posterUrl}
          mediaType={match.mediaType}
          alt=""
          thumbnail={!featured}
          sizes={STUB_POSTER_SIZES}
        />
        <span className="history-stub__text">
          {featured && (
            <span className="history-stub__eyebrow" aria-hidden="true">
              Latest match
            </span>
          )}
          <span className="history-stub__title">{titleLabel(match)}</span>
          <span className="history-stub__detail">{matchStamp(match)}</span>
          {featured && movie.overview && (
            <span className="history-stub__overview" aria-hidden="true">
              {movie.overview}
            </span>
          )}
        </span>
      </span>
    </button>
  );
}

interface MatchListProps {
  mediaType: MediaType;
  search: string;
  onCleared: () => void;
  onOpen: (match: Match) => void;
  onLoaded: (count: number) => void;
}

/** Remounted for each search, so a page still loading can't land in the next list. */
function MatchList({ mediaType, search, onCleared, onOpen, onLoaded }: MatchListProps): JSX.Element {
  const navigate = useNavigate();
  const isDesktop = useBreakpoint() === "desktop";
  const list = usePagedList<Match>(async (nextToken) => {
    const page = await api.matches({ limit: HISTORY_PAGE_SIZE, nextToken, search: search || undefined }, mediaType);
    return { items: page.matches, nextToken: page.nextToken ?? null };
  });
  const count = list.items?.length;
  useEffect(() => {
    if (count !== undefined) onLoaded(count);
  }, [count, onLoaded]);

  return (
      <HistoryList
        list={list}
        label="Past matches"
        layout="wall"
        className="match-history-list"
        itemKey={(match) => match.id}
    <>
      <HistoryList
        list={list}
        label="Past matches"
        layout="wall"
        itemKey={(match) => match.id}
        empty={
          search ? (
            <EmptyState title="No matches found" message="Nothing here has that in its title." icon="heart" />
          ) : (
            <EmptyState
              title="No matches yet"
              message={MODE_COPY[mediaType].noMatchesMessage}
              icon="heart"
              action={<Button onClick={() => navigate(homePath(mediaType), { state: mediaType === "MOVIE" ? MOVIES_STATE : undefined })}>Start swiping</Button>}
            />
          )
        }
        renderItem={(match, index) => (
          <MatchStub match={match} featured={isDesktop && index === 0 && !search} onOpen={() => onOpen(match)} />
        )}
      />
      {!search && (count ?? 0) > 0 && <ClearHistory kind="MATCHES" mediaType={mediaType} onCleared={onCleared} />}
    </>
  );
}

export function MatchHistory({ mediaType = "MOVIE" }: { mediaType?: MediaType }): JSX.Element {
  const [search, setSearch] = useState("");
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<number | null>(null);
  // Out here because a search landing just after a tap remounts the list.
  const [selected, setSelected] = useState<Match | null>(null);
  const settled = useDebouncedValue(search.trim(), SEARCH_DELAY_MS);
  const filters = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (version > 0) filters.current?.focus();
  }, [version]);

  return (
    <>
      <div ref={filters} className="history-filters" tabIndex={-1}>
        <HistorySearch value={search} onChange={setSearch} />
        <HistoryStatus count={settled ? loaded : null} />
      </div>
      <MatchList
        key={`${version}:${settled}`}
        mediaType={mediaType}
        search={settled}
        onCleared={() => setVersion((current) => current + 1)}
        onOpen={setSelected}
        onLoaded={setLoaded}
      />
      <BottomSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        label={selected ? `${selected.movie.title} details` : "Match details"}
        size="lg"
      >
        {selected && <MatchDetails key={selected.id} item={selected} eyebrow={matchStamp(selected)} />}
      </BottomSheet>
    </>
  );
}
