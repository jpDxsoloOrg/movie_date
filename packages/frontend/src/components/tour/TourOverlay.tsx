import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const GUTTER = 16;

export interface TourOverlayProps {
  anchorId: string;
  children: React.ReactNode;
  onNext?: () => void;
  onPrev?: () => void;
  onFinish?: () => void;
  /** When true, pass clicks and drags through to underlying elements for "try-it" steps. */
  interactive?: boolean;
}

export function TourOverlay({
  anchorId,
  children,
  onNext,
  onPrev,
  onFinish,
  interactive = false,
}: TourOverlayProps): JSX.Element | null {
  const anchorRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const [rect, setRect] = useState<DOMRect | null>(null);
  const [position, setPosition] = useState<"top" | "bottom" | "left" | "right">("bottom");
  const [scrolledIntoView, setScrolledIntoView] = useState(true);

  // When interactive mode is enabled, pointer events pass through the overlay
  const isInteractiveMode = interactive;

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
    cardStyle.right = `${rect!.right - (rect!.width - 32) + GUTTER}px`;
  } else if (position === "bottom") {
    cardStyle.bottom = `${rect!.bottom + GUTTER}px`;
  }

  // Clear the other position properties to avoid conflicts
  if (position !== "top") cardStyle.top = undefined;
  if (position !== "bottom") cardStyle.bottom = undefined;
  if (position !== "left") cardStyle.left = undefined;
  if (position !== "right") cardStyle.right = undefined;

  // Mark the page as being in an interactive tour step for auto-undo
  const isInteractiveMode = interactive || document.body.dataset?.tourStep === "interactive";

  // Count children for the step indicator
  const childCount = typeof children === "string" ? 1 : Array.isArray(children) ? children.length : 0;

  return createPortal(
    <div ref={overlayRef} className="tour-overlay__container">
      {/* Navigation buttons container */}
      <div style={{ position: "absolute", top: "-8px", right: "-8px", display: "flex", gap: "8px", zIndex: 102 }}>
        {onPrev && (
          <button
            style={{
              background: "var(--theme-surface-raised)", border: "none", borderRadius: "4px",
              padding: "6px 10px", color: "var(--theme-text)", cursor: "pointer",
              fontSize: "12px", fontWeight: "500",
            }}
            onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
          >
            Prev
          </button>
        )}
      </div>

      {/* Caption card */}
      <div
        id={`${anchorId}-caption`}
        ref={overlayRef.current || null}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${anchorId}-title`}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id={`${anchorId}-title`} style={{ margin: "0 0 8px 0", fontSize: "1.2rem" }}>Step {childCount + 1}</h3>
        <div className="tour-overlay__body">{children}</div>
      </div>

      {/* Ring highlight - only show when not in interactive mode */}
      {!isInteractiveMode && rect && scrolledIntoView && (
        <div
          style={{
            position: "absolute", pointerEvents: "none" as const, borderRadius: "999px", boxSizing: "border-box", borderWidth: "3px", borderStyle: "solid", borderColor: "var(--theme-accent)", boxShadow: `0 0 0 4px var(--theme-scrim)`,
            top: rect!.top, left: rect!.left, right: rect!.right - rect!.left, bottom: rect!.bottom - rect!.top,
          }}
        />
      )}
    </div>,
    document.body,
  );
}
