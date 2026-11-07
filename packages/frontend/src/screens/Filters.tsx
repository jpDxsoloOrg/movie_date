import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { defaultReleaseDateGte, emptyFilters, withDefaultReleaseDate } from "@movie-date/core";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import {
  clearFilterDraft,
  normaliseServices,
  peekFilterDraft,
  stashFilterDraft,
} from "../components/filters/filterDraft";
import { GenrePicker } from "../components/filters/GenrePicker";
import { PickerField } from "../components/filters/PickerField";
import { ServicePicker } from "../components/filters/ServicePicker";
import { useAsyncData } from "../hooks/useAsyncData";
import { useRoom } from "../hooks/useRoom";
import { useToast } from "../hooks/useToast";
import { api, errorMessage, type FiltersInput } from "../services/api";
import "./Filters.css";

const MIN_DATE = "1900-01-01";
const MAX_DATE = "2100-12-31";

interface Edits {
  roomId: string;
  draft: FiltersInput;
}

function longDate(isoDate: string): string {
  // A bare date parses as UTC, which is the day before in the Americas.
  return new Date(`${isoDate}T00:00:00`).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default function Filters(): JSX.Element {
  const { room, setRoom } = useRoom();
  const navigate = useNavigate();
  const toast = useToast();
  const genres = useAsyncData(() => api.genres(), []);
  const [saving, setSaving] = useState(false);

  // Null until the person changes something, so an untouched form follows the
  // live room when a roommate saves, while real edits aren't overwritten.
  const [edits, setEdits] = useState<Edits | null>(() => {
    const draft = peekFilterDraft(room.id);
    return draft ? { roomId: room.id, draft } : null;
  });
  const hasEdits = edits?.roomId === room.id;
  const form = hasEdits ? edits.draft : room.filters;

  useEffect(() => clearFilterDraft(), []);

  const change = (patch: Partial<FiltersInput>): void => {
    setEdits({ roomId: room.id, draft: { ...form, ...patch } });
  };

  const openActors = (): void => {
    if (hasEdits) stashFilterDraft(room.id, form);
    navigate("/filters/actors");
  };

  const defaultStart = defaultReleaseDateGte(new Date());
  const effectiveStart = form.releaseDateGte || defaultStart;
  const dateError =
    form.releaseDateLte && form.releaseDateLte < effectiveStart
      ? `End date must be on or after ${longDate(effectiveStart)}`
      : null;

  const search = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (dateError) return;
    setSaving(true);
    try {
      const filters = withDefaultReleaseDate(
        { ...form, services: normaliseServices(form.services) },
        new Date(),
      );
      setRoom(await api.updateFilters(filters));
      navigate("/");
    } catch (caught) {
      toast.error(errorMessage(caught));
      setSaving(false);
    }
  };

  return (
    <form className="filters" onSubmit={(event) => void search(event)}>
      <h2 className="filters__title">Filters</h2>

      <GenrePicker
        genres={genres.data}
        loading={genres.loading}
        errorText={genres.error ? errorMessage(genres.error) : null}
        onRetry={() => void genres.reload()}
        selectedIds={form.genreIds}
        onChange={(genreIds) => change({ genreIds })}
      />

      <PickerField
        label="Actors"
        value={form.cast.map((actor) => actor.name).join(", ")}
        placeholder="Any actor"
        icon="person"
        trailingIcon="search"
        onClick={openActors}
      />

      <ServicePicker selected={form.services} onChange={(services) => change({ services })} />

      <fieldset className="filters__dates">
        <legend className="filters__legend">Release Date</legend>
        <div className="filters__date-fields">
          <TextField
            label="Start"
            type="date"
            min={MIN_DATE}
            max={MAX_DATE}
            value={form.releaseDateGte ?? ""}
            hint={form.releaseDateGte ? undefined : `Defaults to ${longDate(defaultStart)}`}
            onChange={(event) => change({ releaseDateGte: event.target.value || null })}
          />
          <TextField
            label="End"
            type="date"
            min={MIN_DATE}
            max={MAX_DATE}
            value={form.releaseDateLte ?? ""}
            error={dateError}
            onChange={(event) => change({ releaseDateLte: event.target.value || null })}
          />
        </div>
      </fieldset>

      <div className="filters__actions">
        <Button
          variant="secondary"
          disabled={saving}
          onClick={() => setEdits({ roomId: room.id, draft: emptyFilters() })}
        >
          Clear Filters
        </Button>
        <Button type="submit" loading={saving}>
          Search
        </Button>
      </div>
    </form>
  );
}
