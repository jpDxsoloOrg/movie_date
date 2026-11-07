import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { api, errorMessage, type Person } from "../../services/api";
import { Button } from "../Button";
import { Chip } from "../Chip";
import { Icon } from "../Icon";
import { SkeletonList } from "../Skeleton";
import { TextField } from "../TextField";
import { ActorFace } from "./ActorFace";
import { FilterSection } from "./FilterSection";
import "./ActorPicker.css";

const DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;
const MAX_SUGGESTIONS = 8;

function revealInScroller(element: Element | null | undefined): void {
  // jsdom has no scrollIntoView.
  if (typeof element?.scrollIntoView === "function") element.scrollIntoView({ block: "nearest" });
}

export interface ActorPickerProps {
  selected: Person[];
  onChange: (cast: Person[]) => void;
  /** Opens the full-screen search. */
  onBrowse: () => void;
}

export function ActorPicker({ selected, onChange, onBrowse }: ActorPickerProps): JSX.Element {
  const listId = useId();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const panel = useRef<HTMLDivElement>(null);

  const trimmed = text.trim();
  const searchable = trimmed.length >= MIN_QUERY_LENGTH;

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchable ? trimmed : ""), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [trimmed, searchable]);

  const results = useAsyncData(async () => (query ? api.searchPeople(query) : []), [query]);

  // The old app hid people without a photo: TMDB's long tail is mostly namesakes.
  const suggestions = (results.data ?? []).filter((actor) => actor.profileUrl).slice(0, MAX_SUGGESTIONS);
  const settled = query === trimmed && !results.loading;
  const open = focused && !dismissed && searchable;
  const listShown = open && !results.error && suggestions.length > 0;
  const activeSuggestion = listShown ? suggestions[activeIndex] : undefined;

  // The field can sit at the foot of the page, leaving the suggestions below the fold.
  useEffect(() => {
    if (listShown) revealInScroller(panel.current);
  }, [listShown, suggestions.length]);

  useEffect(() => {
    if (activeIndex >= 0) revealInScroller(panel.current?.querySelector(".actor-picker__option--active"));
  }, [activeIndex]);

  const isSelected = (actor: Person): boolean => selected.some((item) => item.id === actor.id);

  const toggle = (actor: Person): void => {
    onChange(isSelected(actor) ? selected.filter((item) => item.id !== actor.id) : [...selected, actor]);
    setText("");
    setActiveIndex(-1);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Enter") {
      // This sits in the filter form, and a name typed here isn't a request to save.
      event.preventDefault();
      const chosen = activeSuggestion ?? (settled && listShown ? suggestions[0] : undefined);
      if (chosen) toggle(chosen);
      return;
    }
    if (event.key === "Escape" && open) {
      // Otherwise it also reaches the sheet, and the whole form closes.
      event.stopPropagation();
      setDismissed(true);
      return;
    }
    if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || suggestions.length === 0) return;
    event.preventDefault();
    setDismissed(false);
    const step = event.key === "ArrowDown" ? 1 : -1;
    setActiveIndex((index) => (index + step + suggestions.length) % suggestions.length);
  };

  const renderPanel = (): JSX.Element => {
    if (results.error) {
      return (
        <div className="actor-picker__message" role="alert">
          <p>{errorMessage(results.error)}</p>
          <Button variant="secondary" onClick={() => void results.reload()}>
            Try again
          </Button>
        </div>
      );
    }
    if (suggestions.length > 0) {
      return (
        <ul id={listId} className="actor-picker__list" role="listbox" aria-label="Actor suggestions">
          {suggestions.map((actor, index) => {
            const classes = ["actor-picker__option", index === activeIndex && "actor-picker__option--active"]
              .filter(Boolean)
              .join(" ");
            return (
              <li
                key={actor.id}
                id={`${listId}-${index}`}
                className={classes}
                role="option"
                aria-selected={isSelected(actor)}
                onClick={() => toggle(actor)}
              >
                <span className="actor-picker__face">
                  <ActorFace actor={actor} />
                </span>
                <span className="actor-picker__name">{actor.name}</span>
                {isSelected(actor) && <Icon name="check" className="actor-picker__check" />}
              </li>
            );
          })}
        </ul>
      );
    }
    if (!settled) return <SkeletonList rows={3} />;
    return <p className="actor-picker__message">No actors found</p>;
  };

  return (
    <FilterSection title="Actors" meta={selected.length > 0 ? `${selected.length} selected` : "Any actor"}>
      <div className="actor-picker">
        <TextField
          label="Search actors"
          type="search"
          enterKeyHint="search"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={listShown}
          aria-controls={listShown ? listId : undefined}
          aria-activedescendant={activeSuggestion ? `${listId}-${activeIndex}` : undefined}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setDismissed(false);
            setActiveIndex(-1);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
        {/* Keeps focus in the field through a press, so the panel survives to take the
            click and the phone keyboard stays up for the next name. */}
        {open && (
          <div ref={panel} className="actor-picker__panel" onMouseDown={(event) => event.preventDefault()}>
            {renderPanel()}
          </div>
        )}
      </div>

      {selected.length > 0 && (
        <ul className="actor-picker__chips" aria-label="Selected actors">
          {selected.map((actor) => (
            <li key={actor.id}>
              <Chip
                label={actor.name}
                leading={<ActorFace actor={actor} />}
                onRemove={() => onChange(selected.filter((item) => item.id !== actor.id))}
              />
            </li>
          ))}
        </ul>
      )}

      <button type="button" className="actor-picker__browse" onClick={onBrowse}>
        Full actor search
      </button>
    </FilterSection>
  );
}
