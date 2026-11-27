import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { useMode } from "../../mode/ModeProvider";
import { swipeKeys, tutorialImage } from "../../screens/tutorial/steps";
import { Button } from "../Button";
import { tutorialStepFor, type TourStep } from "./tourSteps";
import "./TourOverlay.css";

/** How long a step waits for its element before showing the step's screenshot instead. */
export const ANCHOR_WAIT_MS = 4000;
const ANCHOR_POLL_MS = 100;
/** Layout settles after images and data load, so the ring keeps following for the step. */
const REMEASURE_MS = 250;
const RING_PADDING = 6;
const GUTTER = 16;
const CARD_GAP = 20;

type Placement = "dock-bottom" | "dock-top" | "side" | "center";

function findAnchor(anchors: readonly string[]): HTMLElement | null {
  for (const anchor of anchors) {
    for (const element of document.querySelectorAll<HTMLElement>(`[data-tour="${anchor}"]`)) {
      const rect = element.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) return element;
    }
  }
  return null;
}

function prefersReducedMotion(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export interface TourOverlayProps {
  step: TourStep;
  stepNumber: number;
  total: number;
  title: string;
  text: string;
  onPrev?: () => void;
  onNext: () => void;
  onSkip: () => void;
}

/**
 * Dims the app and rings one real element, with the step's caption beside it. Portalled
 * out of #root, so the focus trap makes the app inert: nothing behind can be swiped or
 * pressed by accident. Positions are set on the elements from JS, which the CSP allows,
 * because they're measured from the page and change as it scrolls.
 */
export function TourOverlay({ step, stepNumber, total, title, text, onPrev, onNext, onSkip }: TourOverlayProps): JSX.Element {
  const breakpoint = useBreakpoint();
  const { mode, copy } = useMode();
  const titleId = useId();
  const textId = useId();
  const trap = useFocusTrap<HTMLDivElement>(true, onSkip);
  const card = trap.ref;
  const ring = useRef<HTMLDivElement>(null);
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [missing, setMissing] = useState(false);
  const [placement, setPlacement] = useState<Placement>("center");
  const [imageFailed, setImageFailed] = useState(false);

  // Screens load their data after the route changes, so the element can take a moment.
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const found = findAnchor(step.anchors);
      if (found) {
        window.clearInterval(timer);
        found.scrollIntoView({ block: "center", inline: "nearest", behavior: prefersReducedMotion() ? "auto" : "smooth" });
        setAnchor(found);
      } else if (Date.now() - startedAt >= ANCHOR_WAIT_MS) {
        window.clearInterval(timer);
        setMissing(true);
      }
    }, ANCHOR_POLL_MS);
    return () => window.clearInterval(timer);
  }, [step]);

  const place = useCallback(() => {
    const ringElement = ring.current;
    const cardElement = card.current;
    if (!anchor || !ringElement || !cardElement) return;
    if (!anchor.isConnected) {
      setAnchor(null);
      return;
    }
    const rect = anchor.getBoundingClientRect();
    ringElement.style.top = `${rect.top - RING_PADDING}px`;
    ringElement.style.left = `${rect.left - RING_PADDING}px`;
    ringElement.style.width = `${rect.width + 2 * RING_PADDING}px`;
    ringElement.style.height = `${rect.height + 2 * RING_PADDING}px`;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    if (breakpoint !== "desktop") {
      // Docked to whichever edge is further from the element, so it never covers it.
      setPlacement(rect.top + rect.height / 2 > viewportHeight * 0.55 ? "dock-top" : "dock-bottom");
      cardElement.style.removeProperty("left");
      cardElement.style.removeProperty("top");
      return;
    }
    setPlacement("side");
    const cardWidth = cardElement.offsetWidth;
    const cardHeight = cardElement.offsetHeight;
    const clampLeft = (value: number): number => Math.min(Math.max(value, GUTTER), viewportWidth - GUTTER - cardWidth);
    const clampTop = (value: number): number => Math.max(Math.min(value, viewportHeight - GUTTER - cardHeight), GUTTER);
    // Beside the element if there's room, then under or over it, and only then a corner,
    // which may overlap a wide element but never hides the card.
    let left: number;
    let top: number;
    if (rect.right + CARD_GAP + cardWidth <= viewportWidth - GUTTER) {
      left = rect.right + CARD_GAP;
      top = clampTop(rect.top);
    } else if (rect.left - CARD_GAP - cardWidth >= GUTTER) {
      left = rect.left - CARD_GAP - cardWidth;
      top = clampTop(rect.top);
    } else if (rect.bottom + CARD_GAP + cardHeight <= viewportHeight - GUTTER) {
      left = clampLeft(rect.left);
      top = rect.bottom + CARD_GAP;
    } else if (rect.top - CARD_GAP - cardHeight >= GUTTER) {
      left = clampLeft(rect.left);
      top = rect.top - CARD_GAP - cardHeight;
    } else {
      left = viewportWidth - GUTTER - cardWidth;
      top = viewportHeight - GUTTER - cardHeight;
    }
    cardElement.style.left = `${left}px`;
    cardElement.style.top = `${top}px`;
  }, [anchor, breakpoint, card]);

  useEffect(() => {
    if (!anchor) return undefined;
    let frame = 0;
    const schedule = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(place);
    };
    schedule();
    const timer = window.setInterval(schedule, REMEASURE_MS);
    window.addEventListener("resize", schedule);
    document.addEventListener("scroll", schedule, true);
    return () => {
      cancelAnimationFrame(frame);
      window.clearInterval(timer);
      window.removeEventListener("resize", schedule);
      document.removeEventListener("scroll", schedule, true);
    };
  }, [anchor, place]);

  const device = breakpoint === "desktop" ? "desktop" : "phone";
  const image = tutorialImage(step.id, mode, device);
  const showInset = Boolean(image) && !imageFailed && (missing || step.inset?.(breakpoint) === true);
  const showKeys = breakpoint === "desktop" && step.id === "deck" && tutorialStepFor(step.id).keys === true;
  const isLast = stepNumber === total;
  const cardPlacement = missing ? "center" : placement;

  return createPortal(
    <div className="tour">
      {anchor && !missing ? <div ref={ring} className="tour__ring" aria-hidden="true" /> : <div className="tour__scrim" aria-hidden="true" />}
      <div
        ref={card}
        className={`tour__card tour__card--${cardPlacement} tour__card--${device}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={textId}
        tabIndex={-1}
        onKeyDown={trap.onKeyDown}
      >
        <div className="tour__progress-row">
          <h1 id={titleId} className="tour__progress">
            Tour, step {stepNumber} of {total}
          </h1>
          <div className="tour__dots" aria-hidden="true">
            {Array.from({ length: total }, (_, index) => (
              <span key={index} className={index < stepNumber ? "tour__dot tour__dot--done" : "tour__dot"} />
            ))}
          </div>
        </div>
        <div className={showInset ? "tour__body tour__body--inset" : "tour__body"}>
          {showInset && image && (
            <img
              className={`tour__inset tour__inset--${device}`}
              src={image}
              alt={tutorialStepFor(step.id).alt(copy, device)}
              decoding="async"
              onError={() => setImageFailed(true)}
            />
          )}
          <div id={textId} className="tour__caption">
            <h2 className="tour__title">{title}</h2>
            <p className="tour__text">{text}</p>
            {showKeys && (
              <dl className="tour__keys" aria-label="Keyboard shortcuts">
                {swipeKeys(copy).map(({ key, keyLabel, action }) => (
                  <div key={key} className="tour__key">
                    <dt>
                      <kbd className="md-kbd">{keyLabel}</kbd>
                    </dt>
                    <dd>{action}</dd>
                  </div>
                ))}
              </dl>
            )}
          </div>
        </div>
        <div className="tour__actions">
          <Button variant="ghost" className="tour__skip" onClick={onSkip}>
            Skip
          </Button>
          {onPrev && (
            <Button variant="secondary" onClick={onPrev}>
              Prev
            </Button>
          )}
          <Button onClick={onNext}>{isLast ? "Finish" : "Next"}</Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
