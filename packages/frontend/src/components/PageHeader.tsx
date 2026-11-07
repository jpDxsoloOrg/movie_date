import { createContext, useContext, type ReactNode, type Ref } from "react";
import { createPortal } from "react-dom";
import "./PageHeader.css";

export interface PageHeaderProps {
  title: string;
  /** Small line above the title. */
  eyebrow?: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
  /** PageLayout's own header is the page's h1; one inside a screen sits under it. */
  level?: 1 | 2;
  /** Where PageActions portals to. */
  actionsRef?: Ref<HTMLDivElement>;
}

export function PageHeader({
  title,
  eyebrow,
  subtitle,
  actions,
  level = 2,
  actionsRef,
}: PageHeaderProps): JSX.Element {
  const Heading = level === 1 ? "h1" : "h2";
  return (
    <header className="md-page-header">
      <div className="md-page-header__text">
        {eyebrow && <p className="md-page-header__eyebrow">{eyebrow}</p>}
        <Heading className="md-page-header__title">{title}</Heading>
        {subtitle && <p className="md-page-header__subtitle">{subtitle}</p>}
      </div>
      <div ref={actionsRef} className="md-page-header__actions">
        {actions}
      </div>
    </header>
  );
}

export const PageActionsContext = createContext<HTMLElement | null>(null);

/**
 * Puts buttons in the header PageLayout draws from the route's title, so a screen can
 * add actions and still render only its content. Without a slot they stay in place.
 */
export function PageActions({ children }: { children: ReactNode }): JSX.Element {
  const slot = useContext(PageActionsContext);
  return slot ? createPortal(children, slot) : <>{children}</>;
}
