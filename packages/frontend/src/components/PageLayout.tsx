import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useMode } from "../mode/ModeProvider";
import { AppBar } from "./AppBar";
import { BottomNav } from "./BottomNav";
import { Drawer } from "./Drawer";
import { PageActionsContext, PageHeader } from "./PageHeader";
import { RouteTransition } from "./RouteTransition";
import { SideNav } from "./SideNav";
import "./PageLayout.css";

export interface PageLayoutProps {
  /** The mode gradient used behind the deck and match screens. */
  gradient?: boolean;
  /** Phones only; from 640px the side navigation is always there. */
  bottomNav?: boolean;
  /** In the app bar on phones, and a PageHeader above the screen from 640px. */
  title?: string;
  /**
   * The screen gets exactly the space between the bars and nothing scrolls, so
   * `height: 100%` works inside it. For the deck, where a drag must not scroll.
   */
  fill?: boolean;
  /**
   * No app bar, drawer or nav: a full-screen step whose own header buttons are the
   * only way out, so they can stop for unsaved work.
   */
  bare?: boolean;
  /** Defaults to the route's Outlet. */
  children?: ReactNode;
}

/**
 * The chrome swaps with the breakpoint but the screen must not remount with it, or a
 * rotated tablet would lose its deck. Each slot below keeps its position in the tree
 * for that reason, so don't restructure them into per-breakpoint branches.
 */
export function PageLayout({
  gradient = false,
  bottomNav = false,
  title,
  fill = false,
  bare = false,
  children,
}: PageLayoutProps): JSX.Element {
  const breakpoint = useBreakpoint();
  const { copy } = useMode();
  const { pathname } = useLocation();
  const content = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionsSlot, setActionsSlot] = useState<HTMLElement | null>(null);
  const isMobile = breakpoint === "mobile";
  const isDesktop = breakpoint === "desktop";

  // PageLayout survives navigation, so its scroller would keep the last page's position.
  useEffect(() => {
    if (content.current) content.current.scrollTop = 0;
  }, [pathname]);

  // There's no drawer on desktop, and it shouldn't reappear when the window narrows.
  useEffect(() => {
    if (isDesktop) setMenuOpen(false);
  }, [isDesktop]);

  // The router owns the URL, so the jump happens here and not through the hash.
  const skipToContent = (event: MouseEvent<HTMLAnchorElement>): void => {
    event.preventDefault();
    content.current?.focus();
  };

  const pageClasses = ["md-page", gradient && "md-page--gradient"].filter(Boolean).join(" ");
  const contentClasses = [
    "md-page__content",
    fill && "md-page__content--fill",
    bare && "md-page__content--bare",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={pageClasses}>
      {!bare && (
        <a className="md-skip-link" href="#main" onClick={skipToContent}>
          Skip to content
        </a>
      )}
      {!bare && isMobile && <AppBar title={title} onOpenMenu={() => setMenuOpen(true)} />}
      {!bare && !isMobile && <SideNav rail={!isDesktop} onOpenMenu={() => setMenuOpen(true)} />}
      {!bare && !isDesktop && <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} />}
      <main ref={content} id="main" className={contentClasses} tabIndex={-1}>
        <PageActionsContext.Provider value={actionsSlot}>
          <RouteTransition className="md-page__column">
            {!bare && title && !isMobile && <PageHeader level={1} title={title} actionsRef={setActionsSlot} />}
            {!bare && title && isMobile && <div ref={setActionsSlot} className="md-page__actions" />}
            {!bare && !title && !isMobile && <h1 className="sr-only">{copy.appTitle}</h1>}
            {children ?? <Outlet />}
          </RouteTransition>
        </PageActionsContext.Provider>
      </main>
      {bottomNav && isMobile && <BottomNav />}
    </div>
  );
}
