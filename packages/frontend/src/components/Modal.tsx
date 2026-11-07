import { useId, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../hooks/useFocusTrap";
import "./Modal.css";

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  /** Action buttons, right aligned. */
  actions?: ReactNode;
}

export function Modal({ open, onClose, title, children, actions }: ModalProps): JSX.Element | null {
  const titleId = useId();
  const trap = useFocusTrap<HTMLDivElement>(open, onClose);
  if (!open) return null;

  return createPortal(
    <div className="md-modal" onClick={onClose}>
      <div
        ref={trap.ref}
        className="md-modal__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trap.onKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="md-modal__title">
          {title}
        </h2>
        <div className="md-modal__body">{children}</div>
        {actions && <div className="md-modal__actions">{actions}</div>}
      </div>
    </div>,
    document.body,
  );
}
