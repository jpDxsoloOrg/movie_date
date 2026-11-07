import { useState, type ReactNode } from "react";
import type { Person } from "../../services/api";
import { Icon } from "../Icon";
import "./ActorRow.css";

export interface ActorRowProps {
  actor: Person;
  /** The row's button. */
  action: ReactNode;
}

export function ActorRow({ actor, action }: ActorRowProps): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = actor.profileUrl && !imageFailed;

  return (
    <li className="actor-row">
      {showImage ? (
        <img
          className="actor-row__image"
          src={actor.profileUrl ?? undefined}
          alt=""
          width={48}
          height={48}
          loading="lazy"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <span className="actor-row__image actor-row__image--fallback">
          <Icon name="person" />
        </span>
      )}
      <span className="actor-row__name">{actor.name}</span>
      {action}
    </li>
  );
}
