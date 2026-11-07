import { isValidRoomCode, normaliseRoomCode } from "@movie-date/core";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { EmptyState, ErrorState } from "../components/StateMessage";
import { useRoom } from "../hooks/useRoom";
import { useToast } from "../hooks/useToast";
import { api, ApiError, errorMessage, type Member } from "../services/api";
import "./JoinInvite.css";

function describeCompany(others: Member[]): string {
  const [first, ...rest] = others;
  if (!first) return "";
  if (rest.length === 0) return ` with ${first.displayName}`;
  return ` with ${first.displayName} and ${rest.length} ${rest.length === 1 ? "other" : "others"}`;
}

/**
 * Always asks, even someone alone in their first room: following a link
 * shouldn't by itself move a person into a stranger's room.
 */
export default function JoinInvite(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { room, setRoom } = useRoom();
  const code = normaliseRoomCode(useParams().code ?? "");
  const [joining, setJoining] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const goHome = (): void => navigate("/", { replace: true });
  const homeButton = <Button onClick={goHome}>Go Home</Button>;

  const join = async (): Promise<void> => {
    setFailure(null);
    setJoining(true);
    try {
      setRoom(await api.joinRoom(code));
      toast.success(`Joined room ${code}`);
      goHome();
    } catch (error) {
      setFailure(error);
      setJoining(false);
    }
  };

  if (!isValidRoomCode(code)) {
    return (
      <div className="join-invite">
        <EmptyState title="Invalid room code" message="Check the link, or ask for a new invite." action={homeButton} />
      </div>
    );
  }

  if (code === room.code) {
    return (
      <div className="join-invite">
        <EmptyState title="You're already in this room" action={homeButton} />
      </div>
    );
  }

  if (failure) {
    const canRetry = failure instanceof ApiError ? failure.isTransient : true;
    return (
      <div className="join-invite">
        <ErrorState
          title="We couldn't join that room"
          message={errorMessage(failure)}
          onRetry={canRetry ? () => void join() : undefined}
        />
        <Button variant={canRetry ? "ghost" : "primary"} onClick={goHome}>
          Go Home
        </Button>
      </div>
    );
  }

  const company = describeCompany(room.members.filter((member) => !member.isMe));

  return (
    <div className="join-invite">
      <h1 className="join-invite__title">Join room {code}?</h1>
      <p className="join-invite__message">
        You're in room {room.code}
        {company}. Joining moves you out of it and removes your swipes from this round.
      </p>
      <div className="join-invite__actions">
        <Button block loading={joining} onClick={() => void join()}>
          Join Room
        </Button>
        <Button variant="ghost" block disabled={joining} onClick={goHome}>
          Stay Here
        </Button>
      </div>
    </div>
  );
}
