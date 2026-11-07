import type { ReactNode } from "react";
import type { Person } from "../../services/api";
import { ActorFace } from "./ActorFace";
import "./ActorRow.css";

export interface ActorRowProps {
  actor: Person;
  /** The row's button. */
  action: ReactNode;
}

export function ActorRow({ actor, action }: ActorRowProps): JSX.Element {
  return (
    <li className="actor-row">
      <ActorFace actor={actor} className="actor-row__image" />
      <span className="actor-row__name">{actor.name}</span>
      {action}
    </li>
  );
}
