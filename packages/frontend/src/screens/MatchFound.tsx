import { useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { Celebration } from "../components/match/Celebration";
import { MatchDetails } from "../components/match/MatchDetails";
import { Skeleton } from "../components/Skeleton";
import { EmptyState, ErrorState } from "../components/StateMessage";
import type { MatchRouteState } from "../context/RoomProvider";
import { useAsyncData } from "../hooks/useAsyncData";
import { useRoom } from "../hooks/useRoom";
import { useToast } from "../hooks/useToast";
import { api, errorMessage } from "../services/api";
import "./MatchFound.css";

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
        <div className="match-found">
          <ErrorState message={errorMessage(error)} onRetry={() => void reload()} onGradient />
        </div>
      );
    }
    if (loading) {
      return (
        <div className="match-found" role="status" aria-label="Loading your match">
          <Skeleton shape="card" className="match-found__poster-skeleton" />
          <Skeleton shape="title" />
          <Skeleton className="match-found__text-skeleton" />
        </div>
      );
    }
    return (
      <div className="match-found">
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
    );
  }

  return (
    <div className="match-found">
      <Celebration />
      <header className="match-found__header">
        <h1 className="match-found__title">Match Found</h1>
        <p className="match-found__subtitle">Your Movie Tonight!</p>
      </header>
      <MatchDetails movie={match.movie} onGradient />
      <Button variant="secondary" block loading={leaving} onClick={() => void backToStart()}>
        Back to Start
      </Button>
    </div>
  );
}
