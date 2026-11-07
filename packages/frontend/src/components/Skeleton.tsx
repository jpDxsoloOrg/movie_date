import "./Skeleton.css";

export type SkeletonShape = "text" | "title" | "circle" | "rect" | "card";

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

/** Whole-screen placeholder shown before the room has loaded. */
export function SkeletonPage(): JSX.Element {
  return (
    <div className="md-skeleton-page" role="status" aria-label="Loading">
      <div className="md-skeleton-page__bar" />
      <div className="md-skeleton-page__body">
        <Skeleton shape="card" />
      </div>
    </div>
  );
}
