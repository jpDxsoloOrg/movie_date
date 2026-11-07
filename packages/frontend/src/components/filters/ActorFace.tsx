import { useState } from "react";
import type { Person } from "../../services/api";
import { Icon } from "../Icon";
import "./ActorFace.css";

export function ActorFace({ actor, className }: { actor: Person; className?: string }): JSX.Element {
  const [imageFailed, setImageFailed] = useState(false);
  const classes = className ? `actor-face ${className}` : "actor-face";

  if (!actor.profileUrl || imageFailed) {
    return (
      <span className={`${classes} actor-face--fallback`}>
        <Icon name="person" />
      </span>
    );
  }
  return (
    <img
      className={classes}
      src={actor.profileUrl}
      alt=""
      loading="lazy"
      onError={() => setImageFailed(true)}
    />
  );
}
