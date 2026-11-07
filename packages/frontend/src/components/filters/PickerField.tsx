import { useId } from "react";
import { Icon, type IconName } from "../Icon";
import "./PickerField.css";

export interface PickerFieldProps {
  label: string;
  /** Empty shows the placeholder. */
  value: string;
  placeholder: string;
  icon: IconName;
  trailingIcon?: IconName;
  onClick: () => void;
}

/** Looks like a read-only text field, as in the old app, but is really a button. */
export function PickerField({
  label,
  value,
  placeholder,
  icon,
  trailingIcon,
  onClick,
}: PickerFieldProps): JSX.Element {
  const labelId = useId();
  const valueId = useId();

  return (
    <div className="picker-field">
      <span id={labelId} className="picker-field__label">
        {label}
      </span>
      <button
        type="button"
        className="picker-field__control"
        aria-labelledby={`${labelId} ${valueId}`}
        onClick={onClick}
      >
        <Icon name={icon} />
        <span id={valueId} className={value ? "picker-field__value" : "picker-field__value picker-field__value--empty"}>
          {value || placeholder}
        </span>
        {trailingIcon && <Icon name={trailingIcon} />}
      </button>
    </div>
  );
}
