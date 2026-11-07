import type { MouseEventHandler, ReactNode } from "react";
import { Icon } from "./Icon";
import "./Tile.css";

export interface TileProps {
  label: string;
  description?: string;
  /** A logo. Decorative: `label` names the tile. */
  imageUrl?: string;
  /** Instead of `imageUrl`, for something like an Icon. */
  media?: ReactNode;
  selected?: boolean;
  disabled?: boolean;
  onClick: MouseEventHandler<HTMLButtonElement>;
  className?: string;
}

/** A pressable choice with a picture. Lay several out in a `.md-tile-grid`. */
export function Tile({
  label,
  description,
  imageUrl,
  media,
  selected = false,
  disabled = false,
  onClick,
  className,
}: TileProps): JSX.Element {
  const classes = ["md-tile", selected && "md-tile--selected", className].filter(Boolean).join(" ");
  return (
    <button type="button" className={classes} aria-pressed={selected} disabled={disabled} onClick={onClick}>
      {selected && (
        <span className="md-tile__check" aria-hidden="true">
          <Icon name="check" />
        </span>
      )}
      <span className="md-tile__media">{imageUrl ? <img src={imageUrl} alt="" loading="lazy" /> : media}</span>
      <span className="md-tile__label">{label}</span>
      {description && <span className="md-tile__description">{description}</span>}
    </button>
  );
}
