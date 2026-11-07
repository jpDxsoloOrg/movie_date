import { useId, useState, type InputHTMLAttributes } from "react";
import { IconButton } from "./Button";
import { Icon } from "./Icon";
import "./TextField.css";

export interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | null;
  /** Shown under the field when there is no error. */
  hint?: string;
}

/** A password field gets a show/hide toggle automatically. */
export function TextField({ label, error, hint, type = "text", className, id, ...rest }: TextFieldProps): JSX.Element {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const noteId = `${inputId}-note`;
  const [revealed, setRevealed] = useState(false);
  const isPassword = type === "password";
  const note = error ?? hint;

  return (
    <div className={className ? `md-field ${className}` : "md-field"}>
      <label className="md-field__label" htmlFor={inputId}>
        {label}
      </label>
      <div className="md-field__control">
        <input
          {...rest}
          id={inputId}
          type={isPassword && revealed ? "text" : type}
          className={error ? "md-field__input md-field__input--error" : "md-field__input"}
          aria-invalid={error ? true : undefined}
          aria-describedby={note ? noteId : undefined}
        />
        {isPassword && (
          <IconButton
            className="md-field__toggle"
            label={revealed ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
            onClick={() => setRevealed((value) => !value)}
          >
            <Icon name={revealed ? "visibilityOff" : "visibility"} />
          </IconButton>
        )}
      </div>
      {note && (
        <p id={noteId} className={error ? "md-field__note md-field__note--error" : "md-field__note"}>
          {note}
        </p>
      )}
    </div>
  );
}
