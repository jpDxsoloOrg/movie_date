import { useState, type ReactNode } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Celebration } from "../components/match/Celebration";
import { matchStamp } from "../components/match/historyFormat";
import { MatchDetails, MatchDetailsSkeleton } from "../components/match/MatchDetails";
import { Skeleton } from "../components/Skeleton";
import { EmptyState, ErrorState } from "../components/StateMessage";
import type { MatchRouteState } from "../context/RoomProvider";
import { useAsyncData } from "../hooks/useAsyncData";
import { useRoom } from "../hooks/useRoom";
import { useToast } from "../hooks/useToast";
import { api, errorMessage } from "../services/api";
import "./MatchFound.css";

const HEADLINE = "Match Found";
const TAGLINE = "Your Movie Tonight!";

function Marquee({ children }: { children: ReactNode }): JSX.Element {
  return <header className="match-found__marquee">{children}</header>;
}

export default function MatchFound(): JSX.Element {
  const { matchId } = useParams();
  const state = useLocation().state as MatchRouteState | null;
  const navigate = useNavigate();
  const toast = useToast();
  const { room, setRoom } = useRoom();
  const [leaving, setLeaving] = useState(false);

  const routedMatch = state?.match?.id === matchId ? state?.match : undefined;
  const { data, error, loading, reload } = useAsyncData(
    async () => routedMatch ?? (matchId ? api.findMatch(matchId) : null),
    [matchId],
  );
  const match = routedMatch ?? data;

  async function backToStart(): Promise<void> {
    if (!match) return;
    setLeaving(true);
    try {
      // Router state outlives a room change, and the new room's round can be the
      // same number, so this match must not be able to reset that room.
      if (match.roomId === room.id) setRoom(await api.startNewRound(match.round));
      navigate("/", { replace: true });
    } catch (caught) {
      toast.error(errorMessage(caught));
      setLeaving(false);
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
            message="This match isn't part of your current room."
            action={
              <Button variant="secondary" onClick={() => navigate("/", { replace: true })}>
                Back to Start
              </Button>
            }
            onGradient
          />
        </div>
      </div>
    );
  }

  return (
    <div className="match-found md-page-wide">
      <Celebration />
      <MatchDetails
        movie={match.movie}
        eyebrow={matchStamp(match)}
        onGradient
        header={
          <Marquee>
            <h1 className="match-found__title">{HEADLINE}</h1>
            <p className="match-found__subtitle">{TAGLINE}</p>
          </Marquee>
        }
        footer={
          <Button variant="secondary" block loading={leaving} onClick={() => void backToStart()}>
            Back to Start
          </Button>
        }
      />
    </div>
  );
}
