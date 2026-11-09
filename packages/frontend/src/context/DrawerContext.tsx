/**
 * Global context for managing Drawer state. The TourProvider uses this so steps can open/close the drawer.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export interface DrawerContextValue {
  /** Open the drawer. */
  setOpen: (open: boolean) => void;
}

export const DrawerContext = createContext<DrawerContextValue | null>(null);

/** A provider that wraps all authenticated routes so the tour can control the drawer. */
export function DrawerProvider({ children }: { children: ReactNode }): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <DrawerContext.Provider value={{ setOpen: setIsOpen }}>
      {children}
    </DrawerContext.Provider>
  );
}
