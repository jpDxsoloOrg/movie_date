/** Plex's chevron. Drawn here so it takes the mode's colours and needs no image request. */
export function PlexMark({ className, label }: { className?: string; label?: string }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="currentColor"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : "true"}
    >
      <path d="M6.5 2.5h6.4l5.6 9.5-5.6 9.5H6.5l5.6-9.5z" />
    </svg>
  );
}
