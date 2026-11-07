import { Skeleton } from "../Skeleton";
import type { FilterPreviewState } from "./useFilterPreview";
import "./PosterFan.css";

const SLOTS = { large: 5, small: 3 } as const;

export interface PosterFanProps {
  preview: FilterPreviewState;
  size: keyof typeof SLOTS;
}

/** The deck you'd get, held like a hand of cards. Decorative: the count says it in words. */
export function PosterFan({ preview, size }: PosterFanProps): JSX.Element | null {
  const slots = SLOTS[size];
  const posters = preview.posterUrls.slice(0, slots);
  // There's no room in the bar for empty frames to mean anything.
  if (size === "small" && posters.length === 0 && !preview.firstLoad) return null;

  const classes = ["poster-fan", `poster-fan--${size}`, preview.stale && "poster-fan--stale"]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} aria-hidden="true">
      {Array.from({ length: slots }, (_, index) => {
        const url = posters[index];
        return (
          <div className="poster-fan__slot" key={url ? `${index}-${url}` : index}>
            {url ? (
              <img className="poster-fan__poster" src={url} alt="" />
            ) : (
              preview.firstLoad && <Skeleton shape="rect" className="poster-fan__skeleton" />
            )}
          </div>
        );
      })}
    </div>
  );
}
