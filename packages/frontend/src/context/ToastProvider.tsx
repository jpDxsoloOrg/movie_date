import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import "./ToastProvider.css";

export type ToastVariant = "info" | "success" | "error";

export interface ToastApi {
  info: (message: string) => void;
  success: (message: string) => void;
  error: (message: string) => void;
}

interface Toast {
  id: number;
  message: string;
  variant: ToastVariant;
}

const TOAST_DURATION_MS = 4000;
const MAX_VISIBLE_TOASTS = 3;

export const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }): JSX.Element {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback(
    (message: string, variant: ToastVariant) => {
      const id = nextId.current;
      nextId.current += 1;
      setToasts((current) => {
        // Repeats happen when a retry fails again; stacking them says nothing new.
        if (current.some((toast) => toast.message === message)) return current;
        return [...current, { id, message, variant }].slice(-MAX_VISIBLE_TOASTS);
      });
      const timer = setTimeout(() => {
        timers.current.delete(timer);
        dismiss(id);
      }, TOAST_DURATION_MS);
      timers.current.add(timer);
    },
    [dismiss],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending) clearTimeout(timer);
    };
  }, []);

  const toastApi = useMemo<ToastApi>(
    () => ({
      info: (message) => show(message, "info"),
      success: (message) => show(message, "success"),
      error: (message) => show(message, "error"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={toastApi}>
      {children}
      {createPortal(
        <div className="md-toasts" role="status" aria-live="polite">
          {toasts.map((toast) => (
            <button
              key={toast.id}
              type="button"
              className={`md-toast md-toast--${toast.variant}`}
              onClick={() => dismiss(toast.id)}
            >
              {toast.message}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
