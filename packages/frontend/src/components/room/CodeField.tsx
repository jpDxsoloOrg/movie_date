import { useId, useState, type InputHTMLAttributes } from "react";
import "./CodeField.css";

export interface CodeFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "maxLength" | "type"> {
  label: string;
  value: string;
  /** Receives what `clean` kept. */
  onChange: (value: string) => void;
  length: number;
  /**
   * Runs on every change and owns the length too. A `maxLength` would cut a pasted
   * "ABC-234" short before the hyphen could be removed.
   */
  clean: (raw: string) => string;
  error?: string | null;
  /** Shown under the field when there is no error. */
  hint?: string;
}

/**
 * One real input laid invisibly over the boxes, not one input per box: paste, the
 * phone's one-time-code suggestion and backspace all keep working as they normally do.
 */
export function CodeField({
  label,
  value,
  onChange,
  length,
  clean,
  error,
  hint,
  className,
  id,
  onFocus,
  onBlur,
  ...rest
}: CodeFieldProps): JSX.Element {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;
  const [focused, setFocused] = useState(false);
  const activeSlot = Math.min(value.length, length - 1);

  const classes = ["room-code", error && "room-code--error", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <label className="room-code__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="room-code__control">
        <div className="room-code__slots" aria-hidden="true">
          {Array.from({ length }, (_, index) => {
            const slotClasses = [
              "room-code__slot",
              value[index] && "room-code__slot--filled",
              focused && index === activeSlot && "room-code__slot--active",
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <span key={index} className={slotClasses}>
                {value[index]}
              </span>
            );
          })}
        </div>
        <input
          {...rest}
          id={inputId}
          type="text"
          className="room-code__input"
          value={value}
          spellCheck={false}
          autoCorrect="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
          onChange={(event) => onChange(clean(event.target.value))}
          onFocus={(event) => {
            setFocused(true);
            onFocus?.(event);
          }}
          onBlur={(event) => {
            setFocused(false);
            onBlur?.(event);
          }}
        />
      </div>
      {note && (
        <p id={noteId} className={error ? "room-code__note room-code__note--error" : "room-code__note"}>
          {note}
        </p>
      )}
    </div>
  );
}
