import { useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import "./BottomSheet.css";

/** Past this share of the panel's height a released drag closes the sheet. */
const DISMISS_FRACTION = 0.3;
const FLICK_PX_PER_MS = 0.5;

interface HandleDrag {
  pointerId: number;
  startY: number;
  startTime: number;
  offsetY: number;
}

export interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  /** Names the dialog for screen readers; visible only if you render it yourself. */
  label: string;
  children: ReactNode;
}

export function BottomSheet({ open, onClose, label, children }: BottomSheetProps): JSX.Element | null {
  const trap = useFocusTrap<HTMLDivElement>(open, onClose);
  const pressedBackdrop = useRef(false);
  const drag = useRef<HandleDrag | null>(null);
  const [dragging, setDragging] = useState(false);
  if (!open) return null;

  const onBackdropPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    pressedBackdrop.current = event.target === event.currentTarget;
  };

  // Only a press that began on the backdrop closes the sheet. The tail of whatever
  // opened it, or of a drag let go out here, is not a tap on the backdrop.
  const onBackdropClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (pressedBackdrop.current && event.target === event.currentTarget) onClose();
    pressedBackdrop.current = false;
  };

  const onHandlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current || event.button !== 0) return;
    if (event.target instanceof Element && event.target.closest("button")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTime: event.timeStamp,
      offsetY: 0,
    };
    setDragging(true);
  };

  const onHandlePointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const active = drag.current;
    if (!active || event.pointerId !== active.pointerId) return;
    active.offsetY = Math.max(0, event.clientY - active.startY);
    if (trap.ref.current) trap.ref.current.style.transform = `translateY(${active.offsetY}px)`;
  };

  const endDrag = (): void => {
    drag.current = null;
    setDragging(false);
    if (trap.ref.current) trap.ref.current.style.transform = "";
  };

  const onHandlePointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    const active = drag.current;
    if (!active || event.pointerId !== active.pointerId) return;
    const height = trap.ref.current?.getBoundingClientRect().height ?? 0;
    const speed = active.offsetY / Math.max(1, event.timeStamp - active.startTime);
    const dismissed =
      active.offsetY > 0 && (active.offsetY >= height * DISMISS_FRACTION || speed >= FLICK_PX_PER_MS);
    endDrag();
    if (dismissed) onClose();
  };

  const onHandlePointerCancel = (event: PointerEvent<HTMLDivElement>): void => {
    if (drag.current?.pointerId === event.pointerId) endDrag();
  };

  // Tab leaves a cross-origin iframe without the trap seeing a keypress, so this
  // catches it there. The trap skips it, keeping Shift+Tab from Close on the content.
  const onSentinelFocus = (): void => {
    trap.ref.current?.querySelector<HTMLElement>(".md-sheet__close")?.focus();
  };

  return createPortal(
    <div className="md-sheet" onPointerDown={onBackdropPointerDown} onClick={onBackdropClick}>
      <div
        ref={trap.ref}
        className={dragging ? "md-sheet__panel md-sheet__panel--dragging" : "md-sheet__panel"}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        tabIndex={-1}
        onKeyDown={trap.onKeyDown}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className="md-sheet__header"
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onPointerCancel={onHandlePointerCancel}
        >
          <span className="md-sheet__handle" aria-hidden="true" />
          <IconButton className="md-sheet__close" label="Close" onClick={onClose}>
            <Icon name="close" />
          </IconButton>
        </div>
        <div className="md-sheet__body">{children}</div>
        <span tabIndex={0} data-focus-sentinel="" onFocus={onSentinelFocus} />
      </div>
    </div>,
    document.body,
  );
}
