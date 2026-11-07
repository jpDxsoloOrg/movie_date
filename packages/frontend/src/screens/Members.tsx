import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
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
    <div className="members">
      <RoomRefresh />
      <InvitePanel code={room.code} />

      <section aria-labelledby="members-title">
        <h2 id="members-title" className="members__title">
          Members ({room.members.length})
        </h2>
        <ul className="members__list">
          {room.members.map((member) => (
            <li key={member.userId} className="members__row">
              <Avatar url={member.avatarUrl} />
              <span className="members__name">{member.displayName}</span>
              {member.isMe && <span className="members__you">You</span>}
            </li>
          ))}
        </ul>
        {room.members.length < 2 && (
          <EmptyState title="It's just you so far" message="Invite someone to start matching on movies." />
        )}
      </section>

      <Button variant="secondary" block className="members__leave" onClick={() => setConfirming(true)}>
        <Icon name="logout" />
        Leave Room
      </Button>

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
