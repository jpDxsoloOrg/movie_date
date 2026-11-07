import type { ReactNode } from "react";
import "./Ticket.css";

export interface TicketProps {
  /** The bright part. Its text sits on the mode's brand gradient. */
  main: ReactNode;
  /** The part you'd tear off. */
  stub: ReactNode;
  className?: string;
}

/** Stacks in a narrow space and tears down the middle in a wide one, wherever it's placed. */
export function Ticket({ main, stub, className }: TicketProps): JSX.Element {
  return (
    <div className={className ? `room-ticket ${className}` : "room-ticket"}>
      <div className="room-ticket__layout">
        <div className="room-ticket__main">{main}</div>
        <div className="room-ticket__stub">{stub}</div>
      </div>
    </div>
  );
}
