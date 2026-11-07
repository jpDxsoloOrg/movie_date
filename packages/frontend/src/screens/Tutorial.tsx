import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Icon, type IconName } from "../components/Icon";
import { BrandMark, Wordmark } from "../components/Wordmark";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useReturnPath } from "../hooks/useReturnPath";
import { useMode } from "../mode/ModeProvider";
import { MODE_COPY, type ModeCopy } from "../mode/modeCopy";
import { markTutorialSeen } from "../services/tutorial";
import "./Tutorial.css";

type TutorialTarget = "home" | "mode" | "join" | "search" | "card" | "code";
type SwipeSide = "like" | "pass";

interface TutorialStep {
  target: TutorialTarget;
  text: string;
  /** Replaces `text` from the desktop breakpoint, for what's done there with a mouse or keys. */
  desktopText?: string;
  demoSwipe?: boolean;
}

const TRIED_SWIPE_MS = 1100;

function stepsFor({ noun, tutorial }: ModeCopy): readonly TutorialStep[] {
  return [
    {
      target: "home",
      text: `Pressing the home icon takes you to the ${noun.one} swipe page.`,
      desktopText: `${tutorial.homeDesktop} in the sidebar takes you to the ${noun.one} swipe page.`,
    },
    {
      target: "mode",
      text: "Movies for tonight, or Going Steady for a show to start together. This switch moves between them, and each has its own deck, filters and matches.",
    },
    { target: "join", text: "Press Join Room and enter the room code given to you by another user." },
    { target: "search", text: `Press Search to find ${noun.other} by ${tutorial.searchFields}.` },
    {
      target: "card",
      demoSwipe: true,
      text: `Swipe left to say "no" and swipe right to say "yes". When enough people in your room swipe right on the same ${noun.one}, a match will be shown.`,
      desktopText: `Use the keys below, or drag the poster. When enough people in your room say yes to the same ${noun.one}, a match will be shown.`,
    },
    {
      target: "card",
      text: "Tap on the poster to see the full description and a trailer.",
      desktopText: "The trailer, full description and where to watch sit beside the deck, for whatever's on top.",
    },
    { target: "code", text: "You can share this room code with another user to have them join your room." },
  ];
}

const NAV_ITEMS: readonly { target: TutorialTarget; label: string; icon: IconName }[] = [
  { target: "home", label: "Home", icon: "home" },
  { target: "join", label: "Join Room", icon: "door" },
  { target: "search", label: "Search", icon: "search" },
];

/** Stays in step with the handler in SwipeDeck, which is what they do for real. */
function swipeKeys({ passAction, likeAction }: ModeCopy): readonly { key: string; keyLabel: string; action: string }[] {
  return [
    { key: "ArrowLeft", keyLabel: "←", action: passAction },
    { key: "ArrowRight", keyLabel: "→", action: likeAction },
    { key: "Backspace", keyLabel: "Backspace", action: "Undo" },
  ];
}

export default function Tutorial(): JSX.Element {
  const navigate = useNavigate();
  const returnPath = useReturnPath();
  const titleId = useId();
  const isDesktop = useBreakpoint() === "desktop";
  const { mode, copy } = useMode();
  const steps = stepsFor(copy);
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

  const step = steps[stepIndex];
  const isLast = stepIndex === steps.length - 1;
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
          <p className={`tutorial__mode ${spot("mode")}`}>
            <span className="tutorial__mode-option tutorial__mode-option--current">{copy.switchLabel}</span>
            <span className="tutorial__mode-option">{MODE_COPY[mode === "TV" ? "MOVIE" : "TV"].switchLabel}</span>
          </p>
          <p className={`tutorial__code ${spot("code")}`}>
            Room Code: <strong>123456</strong>
          </p>
          <div key={triedSwipe?.attempt ?? 0} className={cardClasses}>
            <div className="tutorial__poster">
              <Icon name={copy.icon} />
            </div>
            <span className="tutorial__stamp tutorial__stamp--like">{copy.likeOverlay}</span>
            <span className="tutorial__stamp tutorial__stamp--pass">{copy.passOverlay}</span>
            <div className="tutorial__card-text">
              <p className="tutorial__card-title">{copy.tutorial.sampleTitle}</p>
              <p>{copy.tutorial.sampleGenres}</p>
              <p>{copy.tutorial.sampleFacts}</p>
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
            Tutorial, step {stepIndex + 1} of {steps.length}
          </h1>
          <div className="tutorial__dots" aria-hidden="true">
            {steps.map((_, index) => (
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
            {swipeKeys(copy).map(({ key, keyLabel, action }) => (
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
