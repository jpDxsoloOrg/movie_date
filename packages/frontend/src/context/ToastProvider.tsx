import { createContext, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Icon, type IconName } from "../components/Icon";
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

/** Errors stay longer: they're the toast someone may need to read twice. */
const TOAST_DURATION_MS: Record<ToastVariant, number> = { info: 4000, success: 4000, error: 7000 };
const TOAST_ICON: Record<ToastVariant, IconName> = { info: "info", success: "check", error: "alert" };
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
      }, TOAST_DURATION_MS[variant]);
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
              <Icon name={TOAST_ICON[toast.variant]} className="md-toast__icon" />
              {toast.message}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
