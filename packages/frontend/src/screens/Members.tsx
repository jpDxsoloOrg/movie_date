import { effectiveThreshold } from "@movie-date/core";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { Icon } from "../components/Icon";
import { Modal } from "../components/Modal";
import { EmptyState } from "../components/StateMessage";
import { Avatar } from "../components/room/Avatar";
import { InvitePanel } from "../components/room/InvitePanel";
import { RoomRefresh } from "../components/room/RoomRefresh";
import { useRoom } from "../hooks/useRoom";
import { useToast } from "../hooks/useToast";
import { api, errorMessage } from "../services/api";
import "./Members.css";

export default function Members(): JSX.Element {
  const navigate = useNavigate();
  const toast = useToast();
  const { room, setRoom } = useRoom();
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);

  const memberCount = room.members.length;
  const threshold = effectiveThreshold(room, memberCount);

  const closeConfirm = (): void => {
    if (!leaving) setConfirming(false);
  };

  const leave = async (): Promise<void> => {
    setLeaving(true);
    try {
      setRoom(await api.leaveRoom());
      toast.success("You left the room");
      navigate("/");
    } catch (error) {
      toast.error(errorMessage(error));
      setLeaving(false);
    }
  };

  return (
    <div className="members md-page-wide">
      <RoomRefresh />

      <div className="members__invite">
        <InvitePanel code={room.code} />
      </div>

      <div className="members__people">
        <Card
          as="section"
          title={`Members (${memberCount})`}
          subtitle={`${threshold} yeses make a match.`}
          action={
            <Link className="members__rule-link" to="/settings">
              Change
            </Link>
          }
        >
          <ul className="members__list">
              <li key={member.userId} className="members__row member-row">
            {room.members.map((member) => (
              <li key={member.userId} className="members__row">
                <Avatar url={member.avatarUrl} name={member.displayName} />
                <span className="members__name" title={member.displayName}>
                  {member.displayName}
                </span>
                {member.isMe && <span className="members__you">You</span>}
              </li>
            ))}
          </ul>
          {memberCount < 2 && (
            <EmptyState icon="heart" title="It's just you so far" message="Invite someone to start matching." />
          )}
        </Card>

        <div className="members__leave">
          <p className="members__leave-note">Leaving clears your swipes from this round.</p>
          <Button variant="secondary" onClick={() => setConfirming(true)}>
            <Icon name="logout" />
            Leave Room
          </Button>
        </div>
      </div>

      <Modal
        open={confirming}
        onClose={closeConfirm}
        title="Leave this room?"
        actions={
          <>
            <Button variant="ghost" disabled={leaving} onClick={closeConfirm}>
              Cancel
            </Button>
            <Button variant="brand" loading={leaving} onClick={() => void leave()}>
              Leave
            </Button>
          </>
        }
      >
        Your swipes from this round will be removed, and you'll move to a new room of your own.
      </Modal>
    </div>
  );
}
