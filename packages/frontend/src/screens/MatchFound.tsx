import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { castSearchDraft } from "../components/filters/castSearch";
import { stashFilterDraft } from "../components/filters/filterDraft";
import { Celebration } from "../components/match/Celebration";
import { matchStamp } from "../components/match/historyFormat";
import { MatchDetails, MatchDetailsSkeleton } from "../components/match/MatchDetails";
import { Skeleton } from "../components/Skeleton";
import { EmptyState, ErrorState } from "../components/StateMessage";
import type { MatchRouteState } from "../context/RoomProvider";
import { useAsyncData } from "../hooks/useAsyncData";
import { useRoom, useRoomEvents } from "../hooks/useRoom";
import { useToast } from "../hooks/useToast";
import { useMode } from "../mode/ModeProvider";
import { MODE_COPY } from "../mode/modeCopy";
import { filtersPath, homePath } from "../mode/modeRoutes";
import { api, errorMessage, type Person } from "../services/api";
import "./MatchFound.css";

/** The cast only decides where Back to Start lands, so failing to load it mustn't stop anyone leaving. */
async function castOf(movieId: number): Promise<Person[]> {
  try {
    return await api.movieCast(movieId);
  } catch {
    return [];
  }
}

function Marquee({ children }: { children: ReactNode }): JSX.Element {
  return <header className="match-found__marquee">{children}</header>;
}

export default function MatchFound(): JSX.Element {
  const { matchId } = useParams();
  const state = useLocation().state as MatchRouteState | null;
  const navigate = useNavigate();
  const toast = useToast();
  const { room, setRoom } = useRoom();
  const { mode: routeMediaType } = useMode();
  const [leaving, setLeaving] = useState(false);
  const [clearing, setClearing] = useState(false);

  const routedMatch = state?.match?.id === matchId ? state?.match : undefined;
  const { data, error, loading, reload } = useAsyncData(
    async () => routedMatch ?? (matchId ? api.findMatch(matchId, routeMediaType) : null),
    [matchId, routeMediaType],
  );
  const match = routedMatch ?? data;
  // The match knows what it is. The route only has to speak for one still loading.
  const mediaType = match?.mediaType ?? routeMediaType;
  const copy = MODE_COPY[mediaType];
  const home = homePath(mediaType);

  // Someone else can clear this while it's open.
  const [clearedHere, setClearedHere] = useState(false);
  useRoomEvents((event) => {
    if (event.type === "MATCH_CLEARED" && event.matchId === matchId) setClearedHere(true);
  });
  const cleared = clearedHere || match?.cleared === true;

  const headline = useRef<HTMLHeadingElement>(null);
  const focusHeadline = state?.focusHeadline === true && Boolean(match);
  useEffect(() => {
    if (focusHeadline) headline.current?.focus();
  }, [focusHeadline]);

  async function backToStart(): Promise<void> {
    if (!match) return;
    setLeaving(true);
    try {
      // Router state outlives a room change, and the new room's round can be the
      // same number, so this match must not be able to reset that room, or fill in its search.
      const inThisRoom = match.roomId === room.id;
      // A cleared match keeps the round going, so leaving it mustn't restart everyone's deck.
      const [nextRoom, cast] = await Promise.all([
        inThisRoom && !cleared ? api.startNewRound(match.round, match.mediaType) : null,
        inThisRoom && match.mediaType === "MOVIE" ? castOf(match.movie.id) : [],
      ]);
      if (nextRoom) setRoom(nextRoom);
      if (cast.length === 0) {
        navigate(home, { replace: true });
        return;
      }
      // Search opens with the cast filled in rather than saving it, because filters are
      // the whole room's: the deck only changes when someone presses Apply.
      stashFilterDraft(room.id, castSearchDraft((nextRoom ?? room).filters, cast, new Date()), "MOVIE");
      navigate(filtersPath("MOVIE"), { replace: true });
    } catch (caught) {
      toast.error(errorMessage(caught));
      setLeaving(false);
    }
  }

  async function clear(): Promise<void> {
    if (!match) return;
    setClearing(true);
    try {
      await api.clearMatch(match.id, match.mediaType);
      toast.success("Match cleared");
      navigate(home, { replace: true });
    } catch (caught) {
      toast.error(errorMessage(caught));
      setClearing(false);
    }
  }

  if (!match) {
    if (error && !loading) {
      return (
        <div className="match-found match-found--message md-page-wide">
          <div className="match-found__message">
            <ErrorState message={errorMessage(error)} onRetry={() => void reload()} onGradient />
          </div>
        </div>
      );
    }
    if (loading) {
      return (
        <div className="match-found md-page-wide" role="status" aria-label="Loading your match">
          <MatchDetailsSkeleton
            header={
              <Marquee>
                <Skeleton shape="title" className="match-found__headline-skeleton" />
                <Skeleton className="match-found__tagline-skeleton" />
              </Marquee>
            }
          />
        </div>
      );
    }
    return (
      <div className="match-found match-found--message md-page-wide">
        <div className="match-found__message">
          <EmptyState
            title="Match not found"
            icon={copy.icon}
            message="This match isn't part of your current room."
            action={
              <Button variant="secondary" onClick={() => navigate(home, { replace: true })}>
                {copy.backToStart}
              </Button>
            }
            onGradient
          />
        </div>
      </div>
    );
  }

  // Only the current round's match is still being announced.
  const currentRound = mediaType === "TV" ? room.tvRound : room.round;
  const canClear = match.roomId === room.id && match.round === currentRound && !cleared;

  return (
    <div className="match-found md-page-wide">
      <Celebration />
      <MatchDetails
        item={match}
        eyebrow={matchStamp(match)}
        onGradient
        header={
          <Marquee>
            <h1 ref={headline} className="match-found__title" tabIndex={-1}>
              {copy.matchHeadline}
            </h1>
            <p className="match-found__subtitle">{copy.matchTagline}</p>
          </Marquee>
        }
        footer={
          <div className="match-found__actions">
            <Button variant="secondary" block loading={leaving} disabled={clearing} onClick={() => void backToStart()}>
              {copy.backToStart}
            </Button>
            {canClear && (
              <Button variant="ghost" block loading={clearing} disabled={leaving} onClick={() => void clear()}>
                Clear match
              </Button>
            )}
          </div>
        }
      />
    </div>
  );
}
