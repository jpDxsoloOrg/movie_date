import { useState, type ReactNode } from "react";
import { Outlet } from "react-router-dom";
import { AppBar } from "./AppBar";
import { BottomNav } from "./BottomNav";
import { Drawer } from "./Drawer";
import "./PageLayout.css";

export interface PageLayoutProps {
  /** The coral to amber background used behind the deck and match screens. */
  gradient?: boolean;
  bottomNav?: boolean;
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

export function PageLayout({
  gradient = false,
  bottomNav = false,
  title,
  fill = false,
  bare = false,
  children,
}: PageLayoutProps): JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false);
  const contentClasses = [
    "md-page__content",
    fill && "md-page__content--fill",
    bare && "md-page__content--bare",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={gradient ? "md-page md-page--gradient" : "md-page"}>
      {!bare && <AppBar title={title} onOpenMenu={() => setMenuOpen(true)} />}
      {!bare && <Drawer open={menuOpen} onClose={() => setMenuOpen(false)} />}
      <main className={contentClasses}>
        <div className="md-page__column">{children ?? <Outlet />}</div>
      </main>
      {bottomNav && <BottomNav />}
    </div>
  );
}
