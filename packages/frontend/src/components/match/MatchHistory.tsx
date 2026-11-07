import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { api, type Match, type MediaType } from "../../services/api";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { EmptyState } from "../StateMessage";
import { MODE_COPY } from "../../mode/modeCopy";
import { homePath, MOVIES_STATE } from "../../mode/modeRoutes";
import { HISTORY_PAGE_SIZE, matchStamp, titleLabel } from "./historyFormat";
import { HistoryList } from "./HistoryList";
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

export function MatchHistory({ mediaType = "MOVIE" }: { mediaType?: MediaType }): JSX.Element {
  const navigate = useNavigate();
  const isDesktop = useBreakpoint() === "desktop";
  const [selected, setSelected] = useState<Match | null>(null);
  const list = usePagedList<Match>(async (nextToken) => {
    const page = await api.matches({ limit: HISTORY_PAGE_SIZE, nextToken }, mediaType);
    return { items: page.matches, nextToken: page.nextToken ?? null };
  });

  return (
    <>
      <HistoryList
        list={list}
        label="Past matches"
        layout="wall"
        itemKey={(match) => match.id}
        empty={
          <EmptyState
            title="No matches yet"
            message={MODE_COPY[mediaType].noMatchesMessage}
            icon="heart"
            action={<Button onClick={() => navigate(homePath(mediaType), { state: mediaType === "MOVIE" ? MOVIES_STATE : undefined })}>Start swiping</Button>}
          />
        }
        renderItem={(match, index) => (
          <MatchStub match={match} featured={isDesktop && index === 0} onOpen={() => setSelected(match)} />
        )}
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
