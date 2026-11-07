import type { MouseEventHandler, ReactNode } from "react";
import { Icon } from "./Icon";
import "./Chip.css";

export interface ChipProps {
  label: string;
  /** Makes it a toggle button; `selected` is then its pressed state. */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  selected?: boolean;
  /** Adds a remove button named "Remove <label>". */
  onRemove?: () => void;
  /** A small icon or face before the label. */
  leading?: ReactNode;
  disabled?: boolean;
  className?: string;
}

export function Chip({
  label,
  onClick,
  selected = false,
  onRemove,
  leading,
  disabled = false,
  className,
}: ChipProps): JSX.Element {
  const classes = [
    "md-chip",
    selected && "md-chip--selected",
    onRemove && "md-chip--removable",
    leading ? "md-chip--leading" : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");
  const content = (
    <>
      {leading && <span className="md-chip__leading">{leading}</span>}
      <span className="md-chip__label">{label}</span>
    </>
  );

  if (onClick && !onRemove) {
    return (
      <button
        type="button"
        className={`${classes} md-chip--button`}
        aria-pressed={selected}
        disabled={disabled}
        onClick={onClick}
      >
        {content}
      </button>
    );
  }

  return (
    <span className={classes}>
      {content}
      {onRemove && (
        <button
          type="button"
          className="md-chip__remove"
          aria-label={`Remove ${label}`}
          disabled={disabled}
          onClick={onRemove}
        >
          <Icon name="close" />
        </button>
      )}
    </span>
  );
}
