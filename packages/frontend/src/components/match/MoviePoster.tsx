import { useState } from "react";
import { MODE_COPY } from "../../mode/modeCopy";
import type { MediaType } from "../../services/api";
import { Icon } from "../Icon";
import "./MoviePoster.css";

const FULL_SIZE_SEGMENT = "/t/p/w780/";
const THUMBNAIL_WIDTHS = [185, 342, 500];

function resized(posterUrl: string, width: number): string {
  return posterUrl.replace(FULL_SIZE_SEGMENT, `/t/p/w${width}/`);
}

/** A list row needs about 70px and a poster wall about 240px; w780 would cost far more on mobile data. */
function thumbnailSources(posterUrl: string): string | undefined {
  if (!posterUrl.includes(FULL_SIZE_SEGMENT)) return undefined;
  return THUMBNAIL_WIDTHS.map((width) => `${resized(posterUrl, width)} ${width}w`).join(", ");
}

export interface MoviePosterProps {
  posterUrl: string | null | undefined;
  /** Leave empty when the title is already next to the poster. */
  alt: string;
  thumbnail?: boolean;
  /** The rendered width for a thumbnail, as the `sizes` attribute takes it. */
  sizes?: string;
  className?: string;
  /** Picks what stands in for a missing poster. */
  mediaType?: MediaType;
}

export function MoviePoster({ posterUrl, alt, thumbnail = false, sizes, className, mediaType = "MOVIE" }: MoviePosterProps): JSX.Element {
  const [failed, setFailed] = useState(false);
  const classes = ["match-poster", className].filter(Boolean).join(" ");

  if (!posterUrl || failed) {
    return (
      <div className={`${classes} match-poster--missing`} role={alt ? "img" : undefined} aria-label={alt || undefined}>
        <Icon name={MODE_COPY[mediaType].icon} />
      </div>
    );
  }
  return (
    <img
      className={classes}
      src={thumbnail ? resized(posterUrl, THUMBNAIL_WIDTHS[0] ?? 185) : posterUrl}
      srcSet={thumbnail ? thumbnailSources(posterUrl) : undefined}
      sizes={thumbnail ? sizes : undefined}
      alt={alt}
      loading={thumbnail ? "lazy" : undefined}
      onError={() => setFailed(true)}
    />
  );
}
