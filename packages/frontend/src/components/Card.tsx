import type { HTMLAttributes, ReactNode } from "react";
import "./Card.css";

export type CardVariant = "surface" | "raised" | "scrim";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  /** `scrim` is the see-through panel for sitting on the gradient. */
  variant?: CardVariant;
  as?: "div" | "section" | "article" | "li";
  title?: string;
  subtitle?: string;
  /** Sits opposite the title. */
  action?: ReactNode;
  /** No padding, for a poster or list that runs edge to edge. */
  flush?: boolean;
  children?: ReactNode;
}

export function Card({
  variant = "surface",
  as: Element = "div",
  title,
  subtitle,
  action,
  flush = false,
  className,
  children,
  ...rest
}: CardProps): JSX.Element {
  const classes = ["md-card", `md-card--${variant}`, flush && "md-card--flush", className].filter(Boolean).join(" ");
  return (
    <Element {...rest} className={classes}>
      {(title || action) && (
        <div className="md-card__header">
          <div className="md-card__heading">
            {title && <h2 className="md-card__title">{title}</h2>}
            {subtitle && <p className="md-card__subtitle">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </Element>
  );
}
