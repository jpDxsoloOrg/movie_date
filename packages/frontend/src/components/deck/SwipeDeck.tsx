import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button, IconButton } from "../Button";
import { Icon } from "../Icon";
import { Skeleton } from "../Skeleton";
import { EmptyState, ErrorState } from "../StateMessage";
import { errorMessage, type Movie } from "../../services/api";
import { SwipeCard } from "./SwipeCard";
import { STACK_SIZE, useDeck } from "./useDeck";
import "./SwipeDeck.css";

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName))
  );
}

export function SwipeDeck({ onOpenDetails }: { onOpenDetails: (movie: Movie) => void }): JSX.Element {
  const navigate = useNavigate();
  const { status, error, retry, entries, exiting, swipe, undo, canUndo, finishExit } = useDeck();
  const top = entries[0];

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
    <section className="deck" aria-label="Movie deck">
      <div className="deck__stack">
        {status === "loading" && (
          <div className="deck__state" role="status" aria-label="Loading movies">
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
              title="No more movies"
              message="You've seen everything that fits your filters. Widen them to keep swiping."
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
          disabled={!top}
          onClick={() => swipe("PASS")}
        >
          <Icon name="close" />
        </IconButton>
        <IconButton
          className="deck__control deck__control--undo"
          label="Undo"
          disabled={!canUndo}
          onClick={undo}
        >
          <Icon name="undo" />
        </IconButton>
        <IconButton
          className="deck__control deck__control--like"
          label="Like"
          disabled={!top}
          onClick={() => swipe("LIKE")}
        >
          <Icon name="heart" />
        </IconButton>
      </div>
    </section>
  );
}
