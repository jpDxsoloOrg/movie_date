import { useState } from "react";
import { Icon } from "../Icon";
import "./MoviePoster.css";

/** List rows are about 60px wide; the full w780 poster would cost far more on mobile data. */
function thumbnailUrl(posterUrl: string): string {
  return posterUrl.replace("/t/p/w780/", "/t/p/w185/");
}

export interface MoviePosterProps {
  posterUrl: string | null | undefined;
  /** Leave empty when the title is already next to the poster. */
  alt: string;
  thumbnail?: boolean;
  className?: string;
}

export function MoviePoster({ posterUrl, alt, thumbnail = false, className }: MoviePosterProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const classes = ["match-poster", className].filter(Boolean).join(" ");

  if (!posterUrl || failed) {
    return (
      <div className={`${classes} match-poster--missing`} role={alt ? "img" : undefined} aria-label={alt || undefined}>
        <Icon name="movie" />
      </div>
    );
  }
  return (
    <img
      className={classes}
      src={thumbnail ? thumbnailUrl(posterUrl) : posterUrl}
      alt={alt}
      loading={thumbnail ? "lazy" : undefined}
      onError={() => setFailed(true)}
    />
  );
}
