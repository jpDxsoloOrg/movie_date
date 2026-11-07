import { createContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { isSignedIn, onAuthChange } from "../services/auth";

export type AuthStatus = "loading" | "signedIn" | "signedOut";

export interface AuthContextValue {
  status: AuthStatus;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }): JSX.Element {
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(() => {
    let current = true;
    const unsubscribe = onAuthChange((signedIn) => {
      current = false;
      setStatus(signedIn ? "signedIn" : "signedOut");
    });
    const restore = async (): Promise<void> => {
      let signedIn = false;
      try {
        signedIn = await isSignedIn();
      } catch {
        // Misconfigured build. The login form reports it when used.
      }
      if (current) setStatus(signedIn ? "signedIn" : "signedOut");
    };
    void restore();
    return () => {
      current = false;
      unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ status }), [status]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
