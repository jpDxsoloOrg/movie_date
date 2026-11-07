import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, IconButton } from "../Button";
import { Icon } from "../Icon";
import { Skeleton } from "../Skeleton";
import { EmptyState, ErrorState } from "../StateMessage";
import { errorMessage, type Movie } from "../../services/api";
import { DECK_COPY } from "./deckCopy";
import { SwipeCard } from "./SwipeCard";
import { STACK_SIZE, useDeck } from "./useDeck";
import "./SwipeDeck.css";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
  );
}

export interface SwipeDeckProps {
  /** Left out where a details panel is already showing the top card. */
  onOpenDetails?: (movie: Movie) => void;
  /** Null once there's no card to show. Not called while a deck loads, so a reload keeps the last one. */
  onTopChange?: (movie: Movie | null) => void;
}

export function SwipeDeck({ onOpenDetails, onTopChange }: SwipeDeckProps): JSX.Element {
  const navigate = useNavigate();
  const { status, error, retry, entries, exiting, swipe, undo, canUndo, finishExit } = useDeck();
  const top = entries[0];
  const topMovie = top?.card.movie ?? null;

  useEffect(() => {
    if (status !== "loading") onTopChange?.(topMovie);
  }, [status, topMovie, onTopChange]);

  // One list on purpose: a swiped card must stay the same element, keyed by movie,
  // to fly off from where the drag left it. Two lists would remount it at rest.
  const cards = [
    ...exiting.map(({ entry, direction }) => ({ entry, direction, depth: 0 })),
    ...entries.slice(0, STACK_SIZE).map((entry, depth) => ({ entry, direction: undefined, depth })),
  ].map(({ entry, direction, depth }) => (
    <SwipeCard
      key={entry.card.movie.id}
      card={entry.card}
      depth={depth}
      exitDirection={direction}
      returningFrom={entry.returningFrom}
      onSwipe={swipe}
      onOpenDetails={onOpenDetails}
      onExited={finishExit}
    />
  ));

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      // Dialogs here and in the shell (drawer, Join Room) all carry aria-modal.
      if (isTyping(event.target) || document.querySelector('[aria-modal="true"]')) return;
      if (event.key === "ArrowLeft") swipe("PASS");
      else if (event.key === "ArrowRight") swipe("LIKE");
      else if (event.key === "Backspace") undo();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [swipe, undo]);

  return (
    <section className="deck" aria-label={DECK_COPY.deckLabel}>
      <div className="deck__stack">
        {status === "loading" && (
          <div className="deck__state" role="status" aria-label={DECK_COPY.loading}>
            <Skeleton shape="card" />
          </div>
        )}
        {status === "error" && (
          <div className="deck__state">
            <ErrorState message={errorMessage(error)} onRetry={retry} onGradient />
          </div>
        )}
        {status === "end" && (
          <div className="deck__state">
            <EmptyState
              title={DECK_COPY.endTitle}
              message={DECK_COPY.endMessage}
              action={<Button onClick={() => navigate("/filters")}>Change Filters</Button>}
              onGradient
            />
          </div>
        )}
        {cards}
      </div>

      <p className="sr-only" role="status">
        {top ? `Now showing ${top.card.movie.title}` : ""}
      </p>

      <div className="deck__controls">
        <IconButton
          className="deck__control deck__control--pass"
          label="Pass"
          aria-keyshortcuts="ArrowLeft"
          disabled={!top}
          onClick={() => swipe("PASS")}
        >
          <Icon name="close" />
        </IconButton>
        <IconButton
          className="deck__control deck__control--undo"
          label="Undo"
          aria-keyshortcuts="Backspace"
          disabled={!canUndo}
          onClick={undo}
        >
          <Icon name="undo" />
        </IconButton>
        <IconButton
          className="deck__control deck__control--like"
          label="Like"
          aria-keyshortcuts="ArrowRight"
          disabled={!top}
          onClick={() => swipe("LIKE")}
        >
          <Icon name="heart" />
        </IconButton>
      </div>

      <p className="deck__hint">
        <span className="deck__hint-key">
          <kbd className="md-kbd">←</kbd> Pass
        </span>
        <span className="deck__hint-key">
          <kbd className="md-kbd">⌫</kbd> Undo
        </span>
        <span className="deck__hint-key">
          <kbd className="md-kbd">→</kbd> Like
        </span>
      </p>
    </section>
  );
}
