import { useRef, type KeyboardEvent } from "react";
import { Icon, type IconName } from "./Icon";
import "./SegmentedControl.css";

export interface SegmentOption<TValue extends string> {
  value: TValue;
  label: string;
  icon?: IconName;
}

export interface SegmentedControlProps<TValue extends string> {
  /** Names the group for screen readers. */
  label: string;
  options: readonly SegmentOption<TValue>[];
  value: TValue;
  onChange: (value: TValue) => void;
  /** Fill the container, sharing the width equally. */
  block?: boolean;
  /** For sitting on the gradient. */
  onGradient?: boolean;
}

const STEP_BY_KEY: Partial<Record<string, number>> = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };

/** One of a few views. A radio group, so arrow keys move and select as native radios do. */
export function SegmentedControl<TValue extends string>({
  label,
  options,
  value,
  onChange,
  block = false,
  onGradient = false,
}: SegmentedControlProps<TValue>): JSX.Element {
  const group = useRef<HTMLDivElement>(null);
  const classes = ["md-segmented", block && "md-segmented--block", onGradient && "md-segmented--on-gradient"]
    .filter(Boolean)
    .join(" ");

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const step = STEP_BY_KEY[event.key];
    if (!step) return;
    event.preventDefault();
    const current = options.findIndex((option) => option.value === value);
    const nextIndex = (current + step + options.length) % options.length;
    const next = options[nextIndex];
    if (!next) return;
    onChange(next.value);
    group.current?.querySelectorAll<HTMLElement>('[role="radio"]')[nextIndex]?.focus();
  };

  return (
    <div ref={group} className={classes} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {options.map((option) => {
        const checked = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked ? 0 : -1}
            className={checked ? "md-segmented__option md-segmented__option--checked" : "md-segmented__option"}
            onClick={() => onChange(option.value)}
          >
            {option.icon && <Icon name={option.icon} />}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
