import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"])';

export interface FocusTrap<TElement extends HTMLElement> {
  ref: RefObject<TElement>;
  onKeyDown: (event: KeyboardEvent<TElement>) => void;
}

/**
 * Keyboard behaviour shared by Modal, BottomSheet and Drawer: focus moves in on
 * open, Tab stays inside, Escape closes, focus returns to the opener on close.
 * The panel needs tabIndex={-1} so it can take focus when it has no controls.
 */
export function useFocusTrap<TElement extends HTMLElement>(
  open: boolean,
  onClose: () => void,
): FocusTrap<TElement> {
  const ref = useRef<TElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement;
    ref.current?.focus();
    return () => {
      if (opener instanceof HTMLElement) opener.focus();
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent<TElement>): void => {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab" || !ref.current) return;
    const focusable = [...ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) {
      event.preventDefault();
      return;
    }
    const active = document.activeElement;
    if (event.shiftKey && (active === first || active === ref.current)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return { ref, onKeyDown };
}
