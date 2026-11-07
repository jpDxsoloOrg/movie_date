import type { ReactNode } from "react";
import { Button } from "./Button";
import "./StateMessage.css";

export interface EmptyStateProps {
  title: string;
  message?: string;
  /** Usually a Button. */
  action?: ReactNode;
  /** White text, for use over the gradient. */
  onGradient?: boolean;
}

export function EmptyState({ title, message, action, onGradient = false }: EmptyStateProps): JSX.Element {
  return (
    <div className={onGradient ? "md-state md-state--on-gradient" : "md-state"}>
      <h2 className="md-state__title">{title}</h2>
      {message && <p className="md-state__message">{message}</p>}
      {action}
    </div>
  );
}

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onGradient?: boolean;
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  onGradient = false,
}: ErrorStateProps): JSX.Element {
  return (
    <div className={onGradient ? "md-state md-state--on-gradient" : "md-state"} role="alert">
      <h2 className="md-state__title">{title}</h2>
      {message && <p className="md-state__message">{message}</p>}
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}
