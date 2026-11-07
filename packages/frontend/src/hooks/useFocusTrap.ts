import { useEffect, useRef, type KeyboardEvent, type RefObject } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, [tabindex]:not([tabindex="-1"]):not([data-focus-sentinel])';

/** Dialogs can overlap for a moment, as one closes and the next opens. */
let openDialogs = 0;

/**
 * Tab is only ours to catch while focus is in this document: from inside a trailer
 * iframe it runs straight past the trap. Inert stops it landing on the page behind.
 * Portalled dialogs only: the Tutorial is a full screen inside #root, with no page
 * behind it, and inert would take its own buttons with it.
 */
function holdBackgroundInert(dialog: HTMLElement | null): () => void {
  const root = document.getElementById("root");
  if (!root || !dialog || root.contains(dialog)) return () => undefined;
  openDialogs += 1;
  root.setAttribute("inert", "");
  return () => {
    openDialogs -= 1;
    if (openDialogs === 0) root.removeAttribute("inert");
  };
}

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
    const releaseBackground = holdBackgroundInert(ref.current);
    ref.current?.focus();
    return () => {
      // First, because an inert opener can't take focus back.
      releaseBackground();
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
