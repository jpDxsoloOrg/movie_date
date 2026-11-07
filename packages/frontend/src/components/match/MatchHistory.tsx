import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Match } from "../../services/api";
import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { EmptyState } from "../StateMessage";
import { formatHistoryDate, HISTORY_PAGE_SIZE, movieLabel } from "./historyFormat";
import { HistoryList } from "./HistoryList";
import { MatchDetails } from "./MatchDetails";
import { MoviePoster } from "./MoviePoster";
import { usePagedList } from "./usePagedList";

export function MatchHistory(): JSX.Element {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Match | null>(null);
  const list = usePagedList<Match>(async (nextToken) => {
    const page = await api.matches({ limit: HISTORY_PAGE_SIZE, nextToken });
    return { items: page.matches, nextToken: page.nextToken ?? null };
  });

  return (
    <>
      <HistoryList
        list={list}
        label="Past matches"
        itemKey={(match) => match.id}
        empty={
          <EmptyState
            title="No matches yet"
            message="When everyone likes the same movie, it'll show up here."
            action={<Button onClick={() => navigate("/")}>Start swiping</Button>}
          />
        }
        renderItem={(match) => (
          <button type="button" className="history-row" onClick={() => setSelected(match)}>
            <MoviePoster className="history-row__poster" posterUrl={match.movie.posterUrl} alt="" thumbnail />
            <span className="history-row__text">
              <span className="history-row__title">{movieLabel(match.movie)}</span>
              <span className="history-row__detail">
                {formatHistoryDate(match.matchedAt)} · Round&nbsp;{match.round}
              </span>
            </span>
          </button>
        )}
      />
      <BottomSheet
        open={selected !== null}
        onClose={() => setSelected(null)}
        label={selected ? `${selected.movie.title} details` : "Match details"}
      >
        {selected && <MatchDetails key={selected.id} movie={selected.movie} />}
      </BottomSheet>
    </>
  );
}
