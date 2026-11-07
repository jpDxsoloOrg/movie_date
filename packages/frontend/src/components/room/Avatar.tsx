import { useState } from "react";
import { Icon } from "../Icon";
import "./Avatar.css";

export interface AvatarProps {
  url?: string | null;
  /** Gives the fallback an initial, so a room of people without photos can be told apart. */
  name?: string;
  size?: "md" | "lg";
}

function initialOf(name: string | undefined): string | undefined {
  return name ? Array.from(name.trim())[0]?.toUpperCase() : undefined;
}

/** Decorative: the name beside it, or the surrounding control, carries the meaning. */
export function Avatar({ url, name, size = "md" }: AvatarProps): JSX.Element {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(url) && url !== failedUrl;
  const initial = initialOf(name);

  return (
    <span className={`room-avatar room-avatar--${size}`} aria-hidden="true">
      {showImage && url ? (
        <img className="room-avatar__image" src={url} alt="" onError={() => setFailedUrl(url)} />
      ) : initial ? (
        <span className="room-avatar__initial">{initial}</span>
      ) : (
        <Icon name="person" className="room-avatar__fallback" />
      )}
    </span>
  );
}
