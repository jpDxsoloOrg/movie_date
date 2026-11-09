import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useFocusTrap } from "../../hooks/useFocusTrap";

const GUTTER = 16;

export interface TourOverlayProps {
  anchorId: string;
  children: React.ReactNode;
  onSkip?: () => void;
}

export function TourOverlay({
  anchorId,
  children,
  onSkip,
}: TourOverlayProps): JSX.Element | null {
  const breakpoint = useBreakpoint();
  const anchorRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [rect, setRect] = useState<DOMRect | null>(null);
  const [position, setPosition] = useState<"top" | "bottom" | "left" | "right">("bottom");
  const [scrolledIntoView, setScrolledIntoView] = useState(true);

  const measure = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;

    const bounds = el.getBoundingClientRect();
    const scrollY = window.scrollY || 0;
    const viewport = typeof VisualViewport !== "undefined" ? (window as any).VisualViewport : null;
    const clientWidth = (viewport && viewport.resize) || window.innerWidth;
    const scrollX = (viewport && viewport.scrollX) || window.scrollX || 0;

    setRect({
      x: bounds.x, y: bounds.y + scrollY, width: bounds.width, height: bounds.height,
      top: bounds.top + scrollY, bottom: bounds.bottom + scrollY,
      left: bounds.left + scrollX, right: bounds.right + scrollX,
    } as DOMRect);

    const spaceBelow = Math.max(0, window.innerHeight - (rect?.bottom || 0));
    const spaceAbove = Math.max(0, (rect?.top || 0) - scrollY);

    if (spaceBelow > GUTTER) {
      setPosition("bottom");
    } else if (spaceAbove > GUTTER) {
      setPosition("top");
    } else if ((clientWidth - (rect?.right || 0) - scrollX) > GUTTER) {
      setPosition("right");
    } else {
      setPosition("left");
    }

    setScrolledIntoView(true);
  }, []);

  useEffect(() => measure, [measure]);

  useEffect(() => {
    const el = anchorRef.current;
    if (!el) return () => undefined;
    const obs = new ResizeObserver(() => measure());
    obs.observe(el);
    return () => obs.disconnect();
  }, [measure]);

  const scrollHandler = () => measure();
  useEffect(() => {
    document.addEventListener("scroll", scrollHandler, { capture: true });
    if (typeof VisualViewport !== "undefined") {
      (window as any).VisualViewport?.addEventListener("resize", scrollHandler);
    }
    return () => {
      document.removeEventListener("scroll", scrollHandler);
      if (typeof VisualViewport !== "undefined") {
        (window as any).VisualViewport?.removeEventListener("resize", scrollHandler);
      }
    };
  }, []);

  const trap = useFocusTrap<HTMLDivElement>(true, onSkip || (() => void null));
  const skip = useCallback(() => { onSkip?.(); if (overlayRef.current) overlayRef.current.style.display = "none"; }, [onSkip]);

  const ringWidth = Math.max(rect!.width, rect!.height) * 4;

  // Build style object conditionally to avoid TypeScript errors with overlapping properties
  const cardStyle: React.CSSProperties = {
    position: "absolute",
    backgroundColor: "var(--theme-surface-raised)",
    border: `1px solid var(--theme-border)`,
    borderRadius: "8px",
    padding: `calc(var(--space-2) - 2px) var(--space-3)`,
    color: "var(--theme-text)",
    fontSize: "1rem",
    lineHeight: "1.4",
    zIndex: 101,
    willChange: "auto",
    maxHeight: `${window.innerHeight * 0.6}px`,
  };

  if (position === "top") {
    cardStyle.top = `${rect!.top - 8}px`;
  } else if (position === "left") {
    cardStyle.left = `${rect!.left + GUTTER}px`;
  } else if (position === "right") {
    cardStyle.right = `${rect!.right - (rect!.width - ringWidth) + GUTTER}px`;
  } else if (position === "bottom") {
    cardStyle.bottom = `${rect!.bottom + GUTTER}px`;
  }

  // Clear the other position properties to avoid conflicts
  if (position !== "top") cardStyle.top = undefined;
  if (position !== "bottom") cardStyle.bottom = undefined;
  if (position !== "left") cardStyle.left = undefined;
  if (position !== "right") cardStyle.right = undefined;

  // Count children for the step indicator - handle null/undefined
  const childCount = typeof children === "string" ? 1 : Array.isArray(children) ? children.length : 0;

  return createPortal(
    <div ref={overlayRef} className="tour-overlay__container" style={{ display: scrolledIntoView && rect ? "" : "none" }}>
      {children}
      {scrolledIntoView && rect && (
        <div
          id={`${anchorId}-caption`}
          ref={trap.ref}
          style={cardStyle}
          role="dialog"
          aria-modal="true"
          aria-labelledby={`${anchorId}-title`}
          aria-describedby={anchorRef.current?.id}
          tabIndex={-1}
          onClick={(e) => e.stopPropagation()}
          onKeyDown={trap.onKeyDown}
        >
          <h1 id={`${anchorId}-title`}>Tour, step {childCount + 1} of 0</h1>
          <div className="tour-overlay__body">{children}</div>
        </div>
      )}
      {rect && scrolledIntoView && (
        <div
          style={{
            position: "absolute",
            pointerEvents: "none" as const,
            borderRadius: "999px",
            boxSizing: "border-box" as const,
            borderWidth: "3px",
            borderStyle: "solid",
            borderColor: "var(--theme-accent)",
            boxShadow: `0 0 0 ${ringWidth}px var(--theme-scrim)`,
            top: rect!.top, left: rect!.left, right: rect!.right - rect!.left, bottom: rect!.bottom - rect!.top,
          }}
        />
      )}
    </div>,
    document.body,
  );
}


