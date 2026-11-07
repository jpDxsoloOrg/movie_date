import { useState } from "react";
import { Icon } from "../Icon";
import "./Avatar.css";

export interface AvatarProps {
  url?: string | null;
  size?: "md" | "lg";
}

/** Decorative: the name beside it, or the surrounding control, carries the meaning. */
export function Avatar({ url, size = "md" }: AvatarProps): JSX.Element {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const showImage = Boolean(url) && url !== failedUrl;

  return (
    <span className={`room-avatar room-avatar--${size}`}>
      {showImage && url ? (
        <img className="room-avatar__image" src={url} alt="" onError={() => setFailedUrl(url)} />
      ) : (
        <Icon name="person" className="room-avatar__fallback" />
      )}
    </span>
  );
}
