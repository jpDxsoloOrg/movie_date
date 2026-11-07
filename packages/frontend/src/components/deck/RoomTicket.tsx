import { Icon } from "../Icon";
import { Avatar } from "../room/Avatar";
import type { Member } from "../../services/api";
import "./RoomTicket.css";

const STRIP_FACES = 3;

function inviteLabel(code: string): string {
  return `Room code ${code}. Invite someone`;
}

/** The room code as an admission ticket, in the room panel. */
export function RoomTicket({
  code,
  admits,
  onInvite,
}: {
  code: string;
  admits: number;
  onInvite: () => void;
}): JSX.Element {
  return (
    <button type="button" className="deck-ticket" aria-label={inviteLabel(code)} onClick={onInvite}>
      <span className="deck-ticket__paper">
        <span className="deck-ticket__main">
          <span className="deck-ticket__eyebrow">Room code</span>
          <strong className="deck-ticket__code">{code}</strong>
        </span>
        <span className="deck-ticket__stub">
          <span className="deck-ticket__admit">Admit {admits}</span>
          <span className="deck-ticket__invite">
            <Icon name="share" /> Invite
          </span>
        </span>
      </span>
    </button>
  );
}

/** The same ticket torn down to one line, above the deck on a phone. */
export function RoomTicketStrip({
  code,
  members,
  onInvite,
}: {
  code: string;
  members: readonly Member[];
  onInvite: () => void;
}): JSX.Element {
  return (
    <button type="button" className="deck-ticket-strip" aria-label={inviteLabel(code)} onClick={onInvite}>
      <span className="deck-ticket-strip__paper">
        <span className="deck-ticket-strip__faces">
          {members.slice(0, STRIP_FACES).map((member) => (
            <Avatar key={member.userId} url={member.avatarUrl} />
          ))}
        </span>
        <span>
          Room Code: <strong className="deck-ticket-strip__code">{code}</strong>
        </span>
      </span>
    </button>
  );
}
