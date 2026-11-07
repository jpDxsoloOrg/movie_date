import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Icon, type IconName } from "../components/Icon";
import { BrandMark, Wordmark } from "../components/Wordmark";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useReturnPath } from "../hooks/useReturnPath";
import { markTutorialSeen } from "../services/tutorial";
import "./Tutorial.css";

type TutorialTarget = "home" | "join" | "search" | "card" | "code";
type SwipeSide = "like" | "pass";

interface TutorialStep {
  target: TutorialTarget;
  text: string;
  /** Replaces `text` from the desktop breakpoint, for what's done there with a mouse or keys. */
  desktopText?: string;
  demoSwipe?: boolean;
}

const TRIED_SWIPE_MS = 1100;

const STEPS: readonly TutorialStep[] = [
  {
    target: "home",
    text: "Pressing the home icon takes you to the movie swipe page.",
    desktopText: "Home in the sidebar takes you to the movie swipe page.",
  },
  { target: "join", text: "Press Join Room and enter the room code given to you by another user." },
  { target: "search", text: "Press Search to find movies by genre, actor, streaming service and release date." },
  {
    target: "card",
    demoSwipe: true,
    text: 'Swipe left to say "no" and swipe right to say "yes". When enough people in your room swipe right on the same movie, a match will be shown.',
    desktopText:
      "Use the keys below, or drag the poster. When enough people in your room say yes to the same movie, a match will be shown.",
  },
  {
    target: "card",
    text: "Tap on the poster to see the full description and a trailer.",
    desktopText: "The trailer, full description and where to watch sit beside the deck, for whatever's on top.",
  },
  { target: "code", text: "You can share this room code with another user to have them join your room." },
];

const NAV_ITEMS: readonly { target: TutorialTarget; label: string; icon: IconName }[] = [
  { target: "home", label: "Home", icon: "home" },
  { target: "join", label: "Join Room", icon: "door" },
  { target: "search", label: "Search", icon: "search" },
];

/** Stays in step with the handler in SwipeDeck, which is what they do for real. */
const SWIPE_KEYS: readonly { key: string; keyLabel: string; action: string }[] = [
  { key: "ArrowLeft", keyLabel: "←", action: "Pass" },
  { key: "ArrowRight", keyLabel: "→", action: "Like" },
  { key: "Backspace", keyLabel: "Backspace", action: "Undo" },
];

export default function Tutorial(): JSX.Element {
  const navigate = useNavigate();
  const returnPath = useReturnPath();
  const titleId = useId();
  const isDesktop = useBreakpoint() === "desktop";
  const [stepIndex, setStepIndex] = useState(0);
  const [triedSwipe, setTriedSwipe] = useState<{ side: SwipeSide; attempt: number } | null>(null);

  const finish = (): void => {
    markTutorialSeen();
    navigate(returnPath, { replace: true });
  };

  const trap = useFocusTrap<HTMLDivElement>(true, finish);
  const panel = trap.ref;

  // Prev vanishes on the first step; focus on it would drop out of the dialog.
  useEffect(() => {
    if (!panel.current?.contains(document.activeElement)) panel.current?.focus();
  }, [stepIndex, panel]);

  const step = STEPS[stepIndex];
  const isLast = stepIndex === STEPS.length - 1;
  const spot = (target: TutorialTarget): string => (step?.target === target ? "tutorial__spot" : "");
  const showKeys = isDesktop && Boolean(step?.demoSwipe);

  useEffect(() => {
    if (!showKeys) return undefined;
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      if (event.key === "Backspace") {
        setTriedSwipe(null);
      } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
        const side = event.key === "ArrowRight" ? "like" : "pass";
        setTriedSwipe((tried) => ({ side, attempt: (tried?.attempt ?? 0) + 1 }));
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      setTriedSwipe(null);
    };
  }, [showKeys]);

  useEffect(() => {
    if (!triedSwipe) return undefined;
    const timer = setTimeout(() => setTriedSwipe(null), TRIED_SWIPE_MS);
    return () => clearTimeout(timer);
  }, [triedSwipe]);

  const cardClasses = [
    "tutorial__card",
    spot("card"),
    triedSwipe
      ? `tutorial__card--tried-${triedSwipe.side}`
      : step?.demoSwipe && "tutorial__card--swiping",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="tutorial">
      <div className="tutorial__scene" aria-hidden="true">
        <div className="tutorial__bar">
          <Wordmark />
        </div>
        <div className="tutorial__stage">
          <p className={`tutorial__code ${spot("code")}`}>
            Room Code: <strong>123456</strong>
          </p>
          <div key={triedSwipe?.attempt ?? 0} className={cardClasses}>
            <div className="tutorial__poster">
              <Icon name="movie" />
            </div>
            <span className="tutorial__stamp tutorial__stamp--like">Watch Movie</span>
            <span className="tutorial__stamp tutorial__stamp--pass">Don't Watch</span>
            <div className="tutorial__card-text">
              <p className="tutorial__card-title">Your Next Movie (2026)</p>
              <p>Comedy, Romance</p>
              <p>112 min | 8.1/10</p>
            </div>
          </div>
        </div>
        <div className="tutorial__nav">
          <span className="tutorial__brand">
            <BrandMark />
          </span>
          {NAV_ITEMS.map(({ target, label, icon }) => (
            <span key={target} className={`tutorial__nav-item ${spot(target)}`}>
              <Icon name={icon} />
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="tutorial__scrim" />

      <div
        ref={panel}
        className="tutorial__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trap.onKeyDown}
      >
        <div className="tutorial__progress-row">
          <h1 id={titleId} className="tutorial__progress">
            Tutorial, step {stepIndex + 1} of {STEPS.length}
          </h1>
          <div className="tutorial__dots" aria-hidden="true">
            {STEPS.map((_, index) => (
              <span
                key={index}
                className={index <= stepIndex ? "tutorial__dot tutorial__dot--done" : "tutorial__dot"}
              />
            ))}
          </div>
        </div>
        <p className="tutorial__text" aria-live="polite">
          {(isDesktop && step?.desktopText) || step?.text}
        </p>
        {showKeys && (
          <dl className="tutorial__keys" aria-label="Keyboard shortcuts">
            {SWIPE_KEYS.map(({ key, keyLabel, action }) => (
              <div key={key} className="tutorial__key">
                <dt>
                  <kbd className="md-kbd">{keyLabel}</kbd>
                </dt>
                <dd>{action}</dd>
              </div>
            ))}
          </dl>
        )}
        {showKeys && <p className="tutorial__try">Try them now.</p>}
        <div className="tutorial__actions">
          {!isLast && (
            <Button variant="ghost" className="tutorial__skip" onClick={finish}>
              Skip
            </Button>
          )}
          {stepIndex > 0 && (
            <Button variant="secondary" onClick={() => setStepIndex(stepIndex - 1)}>
              Prev
            </Button>
          )}
          <Button onClick={isLast ? finish : () => setStepIndex(stepIndex + 1)}>
            {isLast ? "Finish" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
