import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
  type TransitionEvent,
} from "react";
import { IconButton } from "../Button";
import { Icon, type IconName } from "../Icon";
import type { DeckCard, Movie, SwipeDirection } from "../../services/api";
import { useMode } from "../../mode/ModeProvider";
import { networkAndRating, runtimeAndRating, showSummary } from "./movieFacts";
import "./SwipeCard.css";

/** Under this many pixels a press is a tap, not a drag. */
const TAP_SLOP_PX = 10;
const OVERLAY_FRACTION = 0.2;
const COMMIT_FRACTION = 0.3;
/** A fast flick commits short of the distance, as it does on every swipe deck. */
const FLICK_PX_PER_MS = 0.5;
const FLICK_MIN_FRACTION = 0.08;
/** Hold still this long before letting go and the flick no longer counts. */
const FLICK_WINDOW_MS = 100;
const MAX_ROTATION_DEG = 18;
const VERTICAL_FOLLOW = 0.35;
const EXIT_ROTATION_DEG = 28;
/** Longer than the CSS exit, for when transitionend never comes (a hidden tab). */
const EXIT_FALLBACK_MS = 500;
/** On the stack, not the card, so the cards behind can rise as this one is dragged away. */
const DRAG_PROGRESS_VAR = "--deck-drag";

interface Gesture {
  pointerId: number;
  startX: number;
  startY: number;
  width: number;
  moved: boolean;
  offsetX: number;
  lastX: number;
  lastTime: number;
  velocityX: number;
}

export interface SwipeCardProps {
  card: DeckCard;
  /** 0 is the top card. */
  depth: number;
  /** Set once swiped: the card flies off this way. */
  exitDirection?: SwipeDirection;
  returningFrom?: SwipeDirection;
  onSwipe: (direction: SwipeDirection) => void;
  /** Left out, a tap does nothing and the card has no details button. */
  onOpenDetails?: (card: DeckCard) => void;
  onExited: (movieId: number) => void;
}

function directionOf(offsetX: number): SwipeDirection {
  return offsetX > 0 ? "LIKE" : "PASS";
}

function releaseDirection(gesture: Gesture, releaseTime: number): SwipeDirection | null {
  const { offsetX, width, velocityX, lastTime } = gesture;
  const distance = Math.abs(offsetX) / width;
  if (distance >= COMMIT_FRACTION) return directionOf(offsetX);
  const flicked =
    releaseTime - lastTime <= FLICK_WINDOW_MS &&
    Math.abs(velocityX) >= FLICK_PX_PER_MS &&
    Math.sign(velocityX) === Math.sign(offsetX) &&
    distance >= FLICK_MIN_FRACTION;
  return flicked ? directionOf(offsetX) : null;
}

function Poster({ movie, icon }: { movie: Movie; icon: IconName }): JSX.Element {
  const [failed, setFailed] = useState(false);
  if (!movie.posterUrl || failed) {
    return (
      <div className="deck-card__poster deck-card__poster--missing">
        <Icon name={icon} />
      </div>
    );
  }
  return (
    <img
      className="deck-card__poster"
      src={movie.posterUrl}
      alt=""
      draggable={false}
      onError={() => setFailed(true)}
    />
  );
}

export function SwipeCard({
  card,
  depth,
  exitDirection,
  returningFrom,
  onSwipe,
  onOpenDetails,
  onExited,
}: SwipeCardProps): JSX.Element {
  const { movie, show } = card;
  const { copy } = useMode();
  const element = useRef<HTMLElement>(null);
  const gesture = useRef<Gesture | null>(null);
  // Outlives the gesture: a mouse drag released short of a swipe still fires click,
  // and by then `gesture` has been cleared.
  const suppressClick = useRef(false);
  const [dragging, setDragging] = useState(false);
  const [overlay, setOverlay] = useState<SwipeDirection | null>(null);
  const isTop = depth === 0 && !exitDirection;

  const clearDragProgress = (): void => {
    element.current?.parentElement?.style.removeProperty(DRAG_PROGRESS_VAR);
  };

  const resetDrag = (): void => {
    gesture.current = null;
    if (element.current) element.current.style.transform = "";
    clearDragProgress();
    setDragging(false);
    setOverlay(null);
  };

  // The card carries on from wherever the drag left it, because it is the same
  // element. The transform is cleared when an undo brings it back mid-flight.
  useLayoutEffect(() => {
    const node = element.current;
    if (!node) return;
    if (!exitDirection) {
      node.style.transform = "";
      return;
    }
    const sign = exitDirection === "LIKE" ? 1 : -1;
    const width = node.getBoundingClientRect().width;
    const distance = window.innerWidth / 2 + width * 0.75;
    node.style.transform = `translate3d(${sign * distance}px, 0, 0) rotate(${sign * EXIT_ROTATION_DEG}deg)`;
    gesture.current = null;
    clearDragProgress();
    setDragging(false);
    // exitDirection drives the overlay from here, and this one mustn't outlive an undo.
    setOverlay(null);
  }, [exitDirection]);

  // A failed swipe coming back lands on top of the card being dragged.
  useLayoutEffect(() => {
    if (depth > 0 && gesture.current) resetDrag();
  }, [depth]);

  useEffect(() => {
    if (!exitDirection) return undefined;
    const timer = setTimeout(() => onExited(movie.id), EXIT_FALLBACK_MS);
    return () => clearTimeout(timer);
  }, [exitDirection, movie.id, onExited]);

  const handlePointerDown = (event: PointerEvent<HTMLElement>): void => {
    if (!isTop || gesture.current || event.button !== 0) return;
    // Capturing here would retarget the click and the button's onClick would never run.
    if (event.target instanceof Element && event.target.closest(".deck-card__info")) return;
    suppressClick.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
    gesture.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      width: event.currentTarget.getBoundingClientRect().width,
      moved: false,
      offsetX: 0,
      lastX: event.clientX,
      lastTime: event.timeStamp,
      velocityX: 0,
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLElement>): void => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId) return;
    const offsetX = event.clientX - active.startX;
    const offsetY = event.clientY - active.startY;
    if (!active.moved) {
      if (Math.hypot(offsetX, offsetY) < TAP_SLOP_PX) return;
      active.moved = true;
      suppressClick.current = true;
      setDragging(true);
    }

    const elapsed = event.timeStamp - active.lastTime;
    if (elapsed > 0) {
      active.velocityX = (event.clientX - active.lastX) / elapsed;
      active.lastX = event.clientX;
      active.lastTime = event.timeStamp;
    }
    active.offsetX = offsetX;

    const fraction = Math.max(-1, Math.min(1, offsetX / active.width));
    event.currentTarget.style.transform =
      `translate3d(${offsetX}px, ${offsetY * VERTICAL_FOLLOW}px, 0) rotate(${fraction * MAX_ROTATION_DEG}deg)`;
    const progress = Math.min(1, Math.abs(fraction) / COMMIT_FRACTION);
    event.currentTarget.parentElement?.style.setProperty(DRAG_PROGRESS_VAR, progress.toFixed(3));
    setOverlay(Math.abs(fraction) > OVERLAY_FRACTION ? directionOf(offsetX) : null);
  };

  const handlePointerUp = (event: PointerEvent<HTMLElement>): void => {
    const active = gesture.current;
    if (!active || event.pointerId !== active.pointerId) return;
    if (!active.moved) {
      resetDrag();
      return;
    }
    const direction = releaseDirection(active, event.timeStamp);
    if (direction) onSwipe(direction);
    else resetDrag();
  };

  /**
   * Details open on click, not pointerup: a touch's click comes after pointerup and
   * is hit-tested then, so a sheet opened any earlier takes the click and closes.
   */
  const handleClick = (): void => {
    if (isTop && !suppressClick.current) onOpenDetails?.(card);
  };

  const handleInfoClick = (event: MouseEvent<HTMLButtonElement>): void => {
    event.stopPropagation();
    onOpenDetails?.(card);
  };

  const handlePointerCancel = (event: PointerEvent<HTMLElement>): void => {
    if (gesture.current?.pointerId === event.pointerId) resetDrag();
  };

  const handleTransitionEnd = (event: TransitionEvent<HTMLElement>): void => {
    if (exitDirection && event.target === event.currentTarget && event.propertyName === "transform") {
      onExited(movie.id);
    }
  };

  const classes = [
    "deck-card",
    exitDirection ? "deck-card--exiting" : `deck-card--depth-${depth}`,
    dragging && "deck-card--dragging",
    !exitDirection && returningFrom === "LIKE" && "deck-card--return-like",
    !exitDirection && returningFrom === "PASS" && "deck-card--return-pass",
  ]
    .filter(Boolean)
    .join(" ");

  const shownOverlay = exitDirection ?? overlay;
  // A show's years sit in its summary line, where they can be a range.
  const title = movie.releaseYear && !show ? `${movie.title}, ${movie.releaseYear}` : movie.title;
  const factLines = show ? [showSummary(show), networkAndRating(show)] : [runtimeAndRating(movie)];

  return (
    <article
      ref={element}
      className={classes}
      aria-hidden={isTop ? undefined : true}
      aria-label={isTop ? movie.title : undefined}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClick={handleClick}
      onTransitionEnd={handleTransitionEnd}
    >
      <Poster movie={movie} icon={copy.icon} />
      <div className="deck-card__scrim" />
      {isTop && onOpenDetails && (
        <IconButton
          className="deck-card__info"
          label={`Details for ${movie.title}`}
          onClick={handleInfoClick}
        >
          <Icon name="info" />
        </IconButton>
      )}
      <div className="deck-card__text">
        <h2 className="deck-card__title">{title}</h2>
        {movie.genres.length > 0 && <p className="deck-card__meta">{movie.genres.join(", ")}</p>}
        {factLines.filter(Boolean).map((line) => (
          <p key={line} className="deck-card__meta">
            {line}
          </p>
        ))}
        <p className="deck-card__overview">{movie.overview}</p>
      </div>
      {shownOverlay && (
        <div className={`deck-card__overlay deck-card__overlay--${shownOverlay.toLowerCase()}`}>
          <span className="deck-card__overlay-label">{shownOverlay === "LIKE" ? copy.likeOverlay : copy.passOverlay}</span>
        </div>
      )}
    </article>
  );
}
