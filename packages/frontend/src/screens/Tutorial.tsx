import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { Icon, type IconName } from "../components/Icon";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useReturnPath } from "../hooks/useReturnPath";
import { markTutorialSeen } from "../services/tutorial";
import "./Tutorial.css";

type TutorialTarget = "home" | "join" | "search" | "card" | "code";

const STEPS: readonly { target: TutorialTarget; text: string; demoSwipe?: boolean }[] = [
  { target: "home", text: "Pressing the home icon takes you to the movie swipe page." },
  { target: "join", text: "Press Join Room and enter the room code given to you by another user." },
  { target: "search", text: "Press Search to find movies by genre, actor, streaming service and release date." },
  {
    target: "card",
    demoSwipe: true,
    text: 'Swipe left to say "no" and swipe right to say "yes". When enough people in your room swipe right on the same movie, a match will be shown.',
  },
  { target: "card", text: "Tap on the poster to see the full description and a trailer." },
  { target: "code", text: "You can share this room code with another user to have them join your room." },
];

const NAV_ITEMS: readonly { target: TutorialTarget; label: string; icon: IconName }[] = [
  { target: "home", label: "Home", icon: "home" },
  { target: "join", label: "Join Room", icon: "door" },
  { target: "search", label: "Search", icon: "search" },
];

export default function Tutorial(): JSX.Element {
  const navigate = useNavigate();
  const returnPath = useReturnPath();
  const titleId = useId();
  const [stepIndex, setStepIndex] = useState(0);

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

  return (
    <div className="tutorial">
      <div className="tutorial__scene" aria-hidden="true">
        <div className="tutorial__bar">Movie Date</div>
        <div className="tutorial__stage">
          <p className={`tutorial__code ${spot("code")}`}>Room Code: 123456</p>
          <div className={`tutorial__card ${spot("card")} ${step?.demoSwipe ? "tutorial__card--swiping" : ""}`}>
            <img className="tutorial__logo" src="/movieDate.png" alt="" />
            <div className="tutorial__card-text">
              <p className="tutorial__card-title">Your Next Movie (2026)</p>
              <p>Comedy, Romance</p>
              <p>112 min | 8.1/10</p>
            </div>
          </div>
        </div>
        <div className="tutorial__nav">
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
        <h1 id={titleId} className="tutorial__progress">
          Tutorial, step {stepIndex + 1} of {STEPS.length}
        </h1>
        <p className="tutorial__text" aria-live="polite">
          {step?.text}
        </p>
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
