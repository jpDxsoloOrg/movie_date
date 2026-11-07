import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import "./BottomSheet.css";

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Names the dialog for screen readers; visible only if you render it yourself. */
  label: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, label, children }: BottomSheetProps): JSX.Element | null {
  const trap = useFocusTrap<HTMLDivElement>(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="md-sheet" onClick={onClose}>
      <div
        ref={trap.ref}
        className="md-sheet__panel"
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={trap.onKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="md-sheet__header">
          <span className="md-sheet__handle" aria-hidden="true" />
          <IconButton className="md-sheet__close" label="Close" onClick={onClose}>
            <Icon name="close" />
          </IconButton>
        </div>
        <div className="md-sheet__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
