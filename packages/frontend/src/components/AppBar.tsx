import { useMode } from "../mode/ModeProvider";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import "./AppBar.css";

export interface AppBarProps {
  title?: string;
  onOpenMenu: () => void;
}

export function AppBar({ title, onOpenMenu }: AppBarProps): JSX.Element {
  const { copy } = useMode();
  return (
    <header className="md-app-bar">
      <IconButton label="Open menu" onClick={onOpenMenu}>
        <Icon name="menu" />
      </IconButton>
      <h1 className="md-app-bar__title">{title ?? copy.appTitle}</h1>
      <span className="md-app-bar__balance" aria-hidden="true" />
    </header>
  );
}
