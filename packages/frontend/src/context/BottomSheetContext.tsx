/**
 * Global context for managing BottomSheet state. The TourProvider uses this so steps can open/close details sheets.
 */
import { createContext, useCallback, useContext, useState, useEffect, type ReactNode, useRef } from "react";

export interface SheetContextValue {
  /** Open a sheet by key. */
  open: (key: string) => void;
  /** Close any open sheet. */
  close: () => void;
}

/** The currently active sheet key, or null if closed. */
const SheetContext = createContext<{ open: (key: string) => void; close: () => void } | null>(null);

/** Track which sheet is currently open to avoid opening multiple. */
interface SheetTracker {
  currentOpenKey: string | null;
}

export function SheetProvider({ children }: { children: ReactNode }): JSX.Element {
  const tracker = useRef<SheetTracker>({ currentOpenKey: null });
  const [openKey, setOpenKey] = useState<string | null>(null);

  const open = useCallback((key: string) => {
    // Only open if nothing is already open
    if (tracker.current.currentOpenKey === null) {
      tracker.current.currentOpenKey = key;
      setOpenKey(key);
    }
  }, []);

  const close = useCallback(() => {
    if (openKey !== null) {
      tracker.current.currentOpenKey = null;
      setOpenKey(null);
    }
  }, [openKey]);

  useEffect(() => {
    // Sync openKey to our single-tracker state
    return () => undefined;
  }, [openKey]);

  return (
    <SheetContext.Provider value={{ open, close }}>
      {children}
    </SheetContext.Provider>
  );
}
