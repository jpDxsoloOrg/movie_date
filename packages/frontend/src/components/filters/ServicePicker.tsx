import { useId, useState } from "react";
import { ANY_SERVICE, PROVIDERS, findProvider } from "@movie-date/core";
import { IconButton } from "../Button";
import { Icon } from "../Icon";
import "./ServicePicker.css";

export interface ServicePickerProps {
  selected: string[];
  onChange: (services: string[]) => void;
}

/** `any` beats specific services everywhere else, so it does here too. */
function specificServices(selected: string[]): string[] {
  if (selected.includes(ANY_SERVICE)) return [];
  return selected.filter((key) => findProvider(key) !== undefined);
}

export function ServicePicker({ selected, onChange }: ServicePickerProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const labelId = useId();
  const optionsId = useId();
  const specific = specificServices(selected);
  const isAny = specific.length === 0;

  const toggle = (key: string): void => {
    if (key === ANY_SERVICE) {
      onChange([]);
      return;
    }
    onChange(specific.includes(key) ? specific.filter((item) => item !== key) : [...specific, key]);
  };

  return (
    <div className="service-picker">
      <span id={labelId} className="service-picker__label">
        Streaming Services
      </span>
      <button
        type="button"
        className="service-picker__toggle"
        aria-labelledby={labelId}
        aria-expanded={open}
        aria-controls={optionsId}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{isAny ? "Any" : `${specific.length} selected`}</span>
        <span className="service-picker__arrow" aria-hidden="true" />
      </button>

      {!isAny && (
        <ul className="service-picker__chips" aria-label="Selected streaming services">
          {specific.map((key) => {
            const provider = findProvider(key);
            if (!provider) return null;
            return (
              <li key={key} className="service-picker__chip">
                <img className="service-picker__icon" src={provider.icon} alt="" width={24} height={24} />
                <span>{provider.label}</span>
                <IconButton label={`Remove ${provider.label}`} onClick={() => toggle(key)}>
                  <Icon name="close" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}

      <div id={optionsId} role="group" aria-labelledby={labelId} className="service-picker__options" hidden={!open}>
        {PROVIDERS.map((provider) => (
          <label key={provider.key} className="service-picker__option">
            <input
              type="checkbox"
              checked={provider.key === ANY_SERVICE ? isAny : specific.includes(provider.key)}
              onChange={() => toggle(provider.key)}
            />
            <img className="service-picker__icon" src={provider.icon} alt="" width={24} height={24} loading="lazy" />
            <span>{provider.label}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
