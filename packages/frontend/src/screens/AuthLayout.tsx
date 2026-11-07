import type { ReactNode } from "react";
import "./Auth.css";

export function AuthLayout({ children }: { children: ReactNode }): JSX.Element {
  return (
    <main className="md-auth">
      <div className="md-auth__column">
        <img className="md-auth__logo" src="/movieDate.png" alt="" />
        <h1 className="md-auth__wordmark">
          Movie<span className="md-auth__wordmark-date">Date</span>
        </h1>
        {children}
      </div>
    </main>
  );
}
