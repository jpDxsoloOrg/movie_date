import "./Skeleton.css";

export type SkeletonShape = "text" | "title" | "circle" | "rect" | "card" | "poster" | "chip" | "tile";

/** Size it with `className` from your own CSS; `card` fills its parent like a poster. */
export function Skeleton({ shape = "text", className }: { shape?: SkeletonShape; className?: string }): JSX.Element {
  const classes = ["md-skeleton", `md-skeleton--${shape}`, className].filter(Boolean).join(" ");
  return <div className={classes} aria-hidden="true" />;
}

/** Stand-in rows for a list. */
export function SkeletonList({ rows = 5 }: { rows?: number }): JSX.Element {
  return (
    <div className="md-skeleton-list" role="status" aria-label="Loading">
      {Array.from({ length: rows }, (_, index) => (
        <div className="md-skeleton-list__row" key={index}>
          <Skeleton shape="circle" />
          <div className="md-skeleton-list__text">
            <Skeleton shape="title" />
            <Skeleton />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Stand-in for rows of posters, like match history or the filter preview. */
export function SkeletonPosterGrid({ count = 6 }: { count?: number }): JSX.Element {
  return (
    <div className="md-skeleton-posters" role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton shape="poster" key={index} />
      ))}
    </div>
  );
}

/** Stand-in for a wrapping set of chips or a tile grid. */
export function SkeletonChoices({ count = 8, shape = "chip" }: { count?: number; shape?: "chip" | "tile" }): JSX.Element {
  return (
    <div className={`md-skeleton-choices md-skeleton-choices--${shape}`} role="status" aria-label="Loading">
      {Array.from({ length: count }, (_, index) => (
        <Skeleton shape={shape} key={index} />
      ))}
    </div>
  );
}

/** Whole-screen placeholder shown before the room has loaded, shaped like the shell. */
export function SkeletonPage(): JSX.Element {
  return (
    <div className="md-skeleton-page" role="status" aria-label="Loading">
      <div className="md-skeleton-page__bar" />
      <div className="md-skeleton-page__body">
        <Skeleton shape="poster" />
      </div>
    </div>
  );
}
