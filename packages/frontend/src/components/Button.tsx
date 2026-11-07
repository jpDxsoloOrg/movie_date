import type { ButtonHTMLAttributes, ReactNode } from "react";
import "./Button.css";

export type ButtonVariant = "primary" | "brand" | "secondary" | "ghost";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Full width of the container. */
  block?: boolean;
  /** Shows a spinner and blocks clicks while keeping the label for layout. */
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  block = false,
  loading = false,
  disabled,
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps): JSX.Element {
  const classes = [
    "md-button",
    `md-button--${variant}`,
    block && "md-button--block",
    loading && "md-button--loading",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button {...rest} type={type} className={classes} disabled={disabled || loading} aria-busy={loading}>
      {loading && <span className="md-button__spinner" aria-hidden="true" />}
      <span className="md-button__label">{children}</span>
    </button>
  );
}

export interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** The accessible name; icon buttons have no visible text. */
  label: string;
  children: ReactNode;
}

export function IconButton({ label, className, children, type = "button", ...rest }: IconButtonProps): JSX.Element {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      className={className ? `md-icon-button ${className}` : "md-icon-button"}
    >
      {children}
    </button>
  );
}
