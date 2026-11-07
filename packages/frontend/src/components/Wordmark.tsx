import { useMode } from "../mode/ModeProvider";
import { Icon } from "./Icon";
import "./Wordmark.css";

/** The mode's tile on its own, for where the words won't fit. */
export function BrandMark(): JSX.Element {
  const { copy } = useMode();
  return (
    <span className="md-brand-mark" aria-hidden="true">
      <Icon name={copy.icon} />
    </span>
  );
}

/** Screens outside a ModeProvider, like login, are always Movie Date. */
export function Wordmark({ large = false }: { large?: boolean }): JSX.Element {
  const { mode } = useMode();
  return (
    <span className={large ? "md-wordmark md-wordmark--large" : "md-wordmark"}>
      {mode === "TV" ? "Going" : "Movie"} <span className="md-wordmark__date">{mode === "TV" ? "Steady" : "Date"}</span>
    </span>
  );
}
