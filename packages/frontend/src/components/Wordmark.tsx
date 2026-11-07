import { Icon } from "./Icon";
import "./Wordmark.css";

/** The clapper tile on its own, for where the words won't fit. */
export function BrandMark(): JSX.Element {
  return (
    <span className="md-brand-mark" aria-hidden="true">
      <Icon name="movie" />
    </span>
  );
}

export function Wordmark({ large = false }: { large?: boolean }): JSX.Element {
  return (
    <span className={large ? "md-wordmark md-wordmark--large" : "md-wordmark"}>
      Movie <span className="md-wordmark__date">Date</span>
    </span>
  );
}
