import type { ReactNode } from "react";
import { TMDB_ATTRIBUTION } from "../components/navigation";
import { PosterCollage } from "../components/PosterCollage";
import { Wordmark } from "../components/Wordmark";
import "./Auth.css";

export function AuthLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main className="md-auth">
      <PosterCollage />
      <div className="md-auth__layout">
        <div className="md-auth__hero">
          <p className="md-auth__headline">Pick the movie before the popcorn gets cold.</p>
          <p className="md-auth__lede">Swipe with the people on your couch. When you all say yes, it's a date.</p>
        </div>
        <div className="md-auth__panel">
          <h1 className="md-auth__wordmark">
            <Wordmark large />
          </h1>
          {children}
          <p className="md-auth__attribution">{TMDB_ATTRIBUTION}</p>
        </div>
      </div>
    </main>
  );
}
