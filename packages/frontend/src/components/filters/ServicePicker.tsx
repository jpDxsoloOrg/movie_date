import { ANY_SERVICE, PLEX_SERVICE, selectableProviders } from "@movie-date/core";
import { PlexMark } from "../PlexMark";
import { Tile } from "../Tile";
import { FilterSection } from "./FilterSection";
import { activeServices } from "./filterDraft";
import "./ServicePicker.css";

export interface ServicePickerProps {
  selected: string[];
  plexAvailable: boolean;
  onChange: (services: string[]) => void;
}

export function ServicePicker({ selected, plexAvailable, onChange }: ServicePickerProps): JSX.Element {
  const specific = activeServices(selected, plexAvailable);
  const isAny = specific.length === 0;

  const toggle = (key: string): void => {
    if (key === ANY_SERVICE) {
      onChange([]);
      return;
    }
    onChange(specific.includes(key) ? specific.filter((item) => item !== key) : [...specific, key]);
  };

  return (
    <FilterSection title="Streaming Services" meta={isAny ? "Any service" : `${specific.length} selected`}>
      <div className="md-tile-grid service-picker" role="group" aria-label="Streaming Services">
        {selectableProviders(plexAvailable).map((provider) => {
          const isPlex = provider.key === PLEX_SERVICE;
          return (
            <Tile
              key={provider.key}
              label={provider.label}
              description={isPlex ? "Library" : undefined}
              imageUrl={isPlex ? undefined : provider.icon}
              media={isPlex ? <PlexMark className="plex-mark" /> : undefined}
              selected={provider.key === ANY_SERVICE ? isAny : specific.includes(provider.key)}
              onClick={() => toggle(provider.key)}
            />
          );
        })}
      </div>
    </FilterSection>
  );
}
