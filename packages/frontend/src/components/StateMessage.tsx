import type { ReactNode } from "react";
import { Button } from "./Button";
import { Icon, type IconName } from "./Icon";
import "./StateMessage.css";

function StateIcon({ name }: { name: IconName }): JSX.Element {
  return (
    <span className="md-state__icon">
      <Icon name={name} />
    </span>
  );
}

export interface EmptyStateProps {
  title: string;
  message?: string;
  /** What the empty thing would be: `heart` for matches, `history` for swipes. */
  icon?: IconName;
  /** Usually a Button. */
  action?: ReactNode;
  /** White text, for use over the gradient. */
  onGradient?: boolean;
}

export function EmptyState({ title, message, icon = "movie", action, onGradient = false }: EmptyStateProps): JSX.Element {
  return (
    <div className={onGradient ? "md-state md-state--on-gradient" : "md-state"}>
      <StateIcon name={icon} />
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
      <StateIcon name="alert" />
      <h2 className="md-state__title">{title}</h2>
      {message && <p className="md-state__message">{message}</p>}
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}
