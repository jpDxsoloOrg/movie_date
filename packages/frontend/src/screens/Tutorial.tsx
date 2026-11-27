import { useEffect, useId, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/Button";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useFocusTrap } from "../hooks/useFocusTrap";
import { useReturnPath } from "../hooks/useReturnPath";
import { useMode } from "../mode/ModeProvider";
import type { ModeCopy } from "../mode/modeCopy";
import { markTutorialSeen } from "../services/tutorial";
import { TUTORIAL_IMAGE_SIZE, TUTORIAL_STEPS, tutorialImage, type TutorialDevice } from "./tutorial/steps";
import "./Tutorial.css";

/** Stays in step with the handler in SwipeDeck, which is what the keys do for real. */
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
  // Tablets keep the phone's shot and words: their layout is the phone's, and they're touched.
  const device: TutorialDevice = useBreakpoint() === "desktop" ? "desktop" : "phone";
  const { mode, copy } = useMode();
  const [stepIndex, setStepIndex] = useState(0);
  // The src that failed, so moving to a step whose image loads clears it without an effect.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  const finish = (): void => {
    markTutorialSeen();
    navigate(returnPath, { replace: true });
  };

  const trap = useFocusTrap<HTMLDivElement>(true, finish);
  const dialog = trap.ref;

  // Prev vanishes on the first step; focus on it would drop out of the dialog.
  useEffect(() => {
    if (!dialog.current?.contains(document.activeElement)) dialog.current?.focus();
  }, [stepIndex, dialog]);

  const step = TUTORIAL_STEPS[stepIndex] ?? TUTORIAL_STEPS[0];
  const nextStep = TUTORIAL_STEPS[stepIndex + 1];
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;
  const src = step ? tutorialImage(step.id, mode, device) : undefined;
  const nextSrc = nextStep ? tutorialImage(nextStep.id, mode, device) : undefined;
  const size = TUTORIAL_IMAGE_SIZE[device];

  // Only the next step's shot, so Next feels instant without fetching all twelve up front.
  useEffect(() => {
    if (!nextSrc) return;
    const preload = new Image();
    preload.decoding = "async";
    preload.src = nextSrc;
  }, [nextSrc]);

  if (!step) return <></>;
  const title = step.title(copy);
  const showImage = src !== undefined && src !== failedSrc;

  return (
    <div className="tutorial">
      <div
        ref={dialog}
        className={`tutorial__dialog tutorial__dialog--${device}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trap.onKeyDown}
      >
        <div className={`tutorial__frame tutorial__frame--${device}`}>
          {showImage ? (
            <img
              key={src}
              className="tutorial__image"
              src={src}
              alt={step.alt(copy, device)}
              width={size.width}
              height={size.height}
              decoding="async"
              onError={() => setFailedSrc(src)}
            />
          ) : (
            // Offline, a shot never seen before isn't cached; the caption still teaches the step.
            <div key={step.id} className="tutorial__placeholder" aria-hidden="true">
              <p>{title}</p>
            </div>
          )}
        </div>

        <div className="tutorial__panel">
          <div className="tutorial__progress-row">
            <h1 id={titleId} className="tutorial__progress">
              Tutorial, step {stepIndex + 1} of {TUTORIAL_STEPS.length}
            </h1>
            <div className="tutorial__dots" aria-hidden="true">
              {TUTORIAL_STEPS.map(({ id }, index) => (
                <span key={id} className={index <= stepIndex ? "tutorial__dot tutorial__dot--done" : "tutorial__dot"} />
              ))}
            </div>
          </div>
          <div className="tutorial__caption" aria-live="polite">
            <h2 className="tutorial__title">{title}</h2>
            <p className="tutorial__text">{(device === "desktop" && step.desktopText?.(copy)) || step.text(copy)}</p>
          </div>
          {device === "desktop" && step.keys && (
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
          <div className="tutorial__actions">
            <Button variant="ghost" className="tutorial__skip" onClick={finish}>
              Skip
            </Button>
            {stepIndex > 0 && (
              <Button variant="secondary" onClick={() => setStepIndex(stepIndex - 1)}>
                Prev
              </Button>
            )}
            <Button onClick={isLast ? finish : () => setStepIndex(stepIndex + 1)}>{isLast ? "Finish" : "Next"}</Button>
          </div>
        </div>
      </div>
    </div>
  );
}
