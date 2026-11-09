/**
 * Global context for managing invite-related state. The TourProvider uses this so steps can open/close invite sheets/panels.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface InviteContextValue {
  /** Open the invite sheet. */
  setOpen: (open: boolean) => void;
}

export const InviteContext = createContext<InviteContextValue | null>(null);

/** A provider that wraps all authenticated routes so the tour can control invite UI. */
export function InviteProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <InviteContext.Provider value={{ setOpen: setIsOpen }}>
      {children}
    </InviteContext.Provider>
  );
}