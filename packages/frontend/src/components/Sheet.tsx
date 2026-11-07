import { useId, useRef, useState, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import "./Sheet.css";

/** Past this share of the panel's height a released drag closes the sheet. */
const DISMISS_FRACTION = 0.3;
const FLICK_PX_PER_MS = 0.5;

interface HandleDrag {
  pointerId: number;
  startY: number;
  startTime: number;
  offsetY: number;
}

export type SheetSize = "sm" | "md" | "lg";

interface SheetBaseProps {
  open: boolean;
  onClose: () => void;
  /** Footer that stays put while the body scrolls, for Apply or Save. */
  actions?: ReactNode;
  /** The dialog's width from 640px. */
  size?: SheetSize;
  /** Take the whole screen on a phone, like Filters. */
  fullScreen?: boolean;
  children: ReactNode;
}

/** Either a visible `title`, or a `label` that only screen readers get. */
export type SheetProps = SheetBaseProps &
  ({ title: string; label?: undefined } | { label: string; title?: undefined });

/**
 * A draggable bottom sheet on phones and a centred dialog from 640px. It's the same
 * element either way, restyled by CSS, so resizing doesn't restart a playing trailer.
 */
export function Sheet({
  open,
  onClose,
  label,
  title,
  actions,
  size = "md",
  fullScreen = false,
  children,
}: SheetProps): JSX.Element | null {
  const titleId = useId();
  const draggable = useBreakpoint() === "mobile";
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
    if (!draggable || drag.current || event.button !== 0) return;
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

  const panelClasses = [
    "md-sheet__panel",
    `md-sheet__panel--${size}`,
    dragging && "md-sheet__panel--dragging",
    fullScreen && "md-sheet__panel--full-screen",
  ]
    .filter(Boolean)
    .join(" ");

  return createPortal(
    <div className="md-sheet" onPointerDown={onBackdropPointerDown} onClick={onBackdropClick}>
      <div
        ref={trap.ref}
        className={panelClasses}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        aria-labelledby={title ? titleId : undefined}
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
          {title && (
            <h2 id={titleId} className="md-sheet__title">
              {title}
            </h2>
          )}
          <IconButton className="md-sheet__close" label="Close" onClick={onClose}>
            <Icon name="close" />
          </IconButton>
        </div>
        <div className="md-sheet__body">{children}</div>
        {actions && <div className="md-sheet__actions">{actions}</div>}
        <span tabIndex={0} data-focus-sentinel="" onFocus={onSentinelFocus} />
      </div>
    </div>,
    document.body,
  );
}
