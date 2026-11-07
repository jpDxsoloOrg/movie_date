import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { emptyFilters, findProvider, withDefaultReleaseDate } from "@movie-date/core";
import { PageHeader } from "../components/PageHeader";
import { Sheet } from "../components/Sheet";
import { ActiveFilters, type ActiveFilter } from "../components/filters/ActiveFilters";
import { ActorFace } from "../components/filters/ActorFace";
import { ActorPicker } from "../components/filters/ActorPicker";
import { ApplyBar, type ApplyControlProps } from "../components/filters/ApplyBar";
import type { ItemNoun } from "../components/filters/FilterCount";
import {
  activeServices,
  clearFilterDraft,
  normaliseServices,
  peekFilterDraft,
  stashFilterDraft,
} from "../components/filters/filterDraft";
import { GenrePicker } from "../components/filters/GenrePicker";
import { PreviewTicket } from "../components/filters/PreviewTicket";
import { ReleaseRange } from "../components/filters/ReleaseRange";
import { rangeLabel, releaseDateError } from "../components/filters/releaseRange";
import { ServicePicker } from "../components/filters/ServicePicker";
import { useFilterPreview } from "../components/filters/useFilterPreview";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useRoom } from "../hooks/useRoom";
import { useToast } from "../hooks/useToast";
import { api, errorMessage, type FiltersInput } from "../services/api";
import "./Filters.css";

const MOVIES: ItemNoun = { one: "movie", other: "movies" };

interface Edits {
  roomId: string;
  draft: FiltersInput;
}

function isUnfiltered(filters: FiltersInput): boolean {
  const { genreIds, services, cast, releaseDateGte, releaseDateLte } = filters;
  return (
    genreIds.length === 0 && services.length === 0 && cast.length === 0 && !releaseDateGte && !releaseDateLte
  );
}

/** Exactly what Apply would save, so the preview counts the same thing. */
function toSavedFilters(form: FiltersInput): FiltersInput {
  return withDefaultReleaseDate({ ...form, services: normaliseServices(form.services) }, new Date());
}

export default function Filters(): JSX.Element {
  const { room, setRoom } = useRoom();
  const navigate = useNavigate();
  const toast = useToast();
  const breakpoint = useBreakpoint();
  const genres = useAsyncData(() => api.genres(), []);
  const [saving, setSaving] = useState(false);

  // The phone sheet and the page are different trees. The fields live in this one node,
  // which moves between them, so a rotation across 640px can't reset what's in them.
  const [fieldsHost] = useState(() => {
    const host = document.createElement("div");
    host.className = "filters__fields-host";
    return host;
  });
  const fieldsSlot = useCallback(
    (slot: HTMLDivElement | null) => {
      slot?.appendChild(fieldsHost);
    },
    [fieldsHost],
  );

  // Null until the person changes something, so an untouched form follows the
  // live room when a roommate saves, while real edits aren't overwritten.
  const [edits, setEdits] = useState<Edits | null>(() => {
    const draft = peekFilterDraft(room.id);
    return draft ? { roomId: room.id, draft } : null;
  });
  const hasEdits = edits?.roomId === room.id;
  const form = hasEdits ? edits.draft : room.filters;

  useEffect(() => clearFilterDraft(), []);

  const now = new Date();
  const dateError = releaseDateError(form, now);
  const preview = useFilterPreview(dateError ? null : toSavedFilters(form));

  const change = (patch: Partial<FiltersInput>): void => {
    setEdits({ roomId: room.id, draft: { ...form, ...patch } });
  };

  const openActors = (): void => {
    if (hasEdits) stashFilterDraft(room.id, form);
    navigate("/filters/actors");
  };

  const apply = async (): Promise<void> => {
    if (dateError) return;
    setSaving(true);
    try {
      setRoom(await api.updateFilters(toSavedFilters(form)));
      navigate("/");
    } catch (caught) {
      toast.error(errorMessage(caught));
      setSaving(false);
    }
  };

  const onSubmit = (event: FormEvent): void => {
    event.preventDefault();
    void apply();
  };

  const services = activeServices(form.services, room.plexAvailable);
  const dateLabel = rangeLabel(form, now);
  const activeFilters: ActiveFilter[] = [
    ...(genres.data ?? [])
      .filter((genre) => form.genreIds.includes(genre.id))
      .map((genre) => ({
        id: `genre-${genre.id}`,
        label: genre.name,
        onRemove: () => change({ genreIds: form.genreIds.filter((id) => id !== genre.id) }),
      })),
    ...services.map((key) => ({
      id: `service-${key}`,
      label: findProvider(key)?.label ?? key,
      onRemove: () => change({ services: services.filter((item) => item !== key) }),
    })),
    ...form.cast.map((actor) => ({
      id: `actor-${actor.id}`,
      label: actor.name,
      leading: <ActorFace actor={actor} />,
      onRemove: () => change({ cast: form.cast.filter((item) => item.id !== actor.id) }),
    })),
    ...(dateLabel
      ? [
          {
            id: "dates",
            label: dateLabel,
            onRemove: () => change({ releaseDateGte: null, releaseDateLte: null }),
          },
        ]
      : []),
  ];

  // Only saving fills in the default start, so a room that's never saved deals everything.
  const emptyText = isUnfiltered(room.filters)
    ? `The deck has every ${MOVIES.one} for now. Apply with nothing picked narrows it to this year’s.`
    : `Nothing picked, so Apply deals this year’s ${MOVIES.other} on any service.`;

  const summary = (
    <ActiveFilters
      filters={activeFilters}
      emptyText={emptyText}
      onClearAll={() => setEdits({ roomId: room.id, draft: emptyFilters() })}
    />
  );

  const fields = (
    <form className="filters__form" onSubmit={onSubmit}>
      <GenrePicker
        genres={genres.data}
        loading={genres.loading}
        errorText={genres.error ? errorMessage(genres.error) : null}
        onRetry={() => void genres.reload()}
        selectedIds={form.genreIds}
        onChange={(genreIds) => change({ genreIds })}
      />
      <ServicePicker
        selected={form.services}
        plexAvailable={room.plexAvailable}
        onChange={(picked) => change({ services: picked })}
      />
      <ActorPicker selected={form.cast} onChange={(cast) => change({ cast })} onBrowse={openActors} />
      <ReleaseRange
        title="Release Date"
        dates={form}
        error={dateError}
        onChange={(dates) => change(dates)}
      />
    </form>
  );

  const applyControl: ApplyControlProps = {
    preview,
    noun: MOVIES,
    problem: dateError ? "Check the release dates" : null,
    saving,
    onApply: () => void apply(),
  };

  return (
    <>
      {createPortal(fields, fieldsHost)}
      {breakpoint === "mobile" ? (
        <Sheet
          open
          fullScreen
          title="Filters"
          onClose={() => navigate("/")}
          actions={<ApplyBar {...applyControl} />}
        >
          <div className="filters__sheet-summary">{summary}</div>
          <div ref={fieldsSlot} className="filters__fields-slot" />
        </Sheet>
      ) : (
        <div className="filters md-page-wide">
          {/* In the grid, so the ticket starts level with it and its height sum holds. */}
          <div className="filters__layout">
            <PageHeader title="Filters" subtitle="Everyone in the room swipes the same deck." />
            {breakpoint === "tablet" && <div className="filters__tablet-summary">{summary}</div>}
            <div ref={fieldsSlot} className="filters__fields-slot" />
            {breakpoint === "tablet" ? (
              <div className="filters__sticky-bar">
                <ApplyBar {...applyControl} />
              </div>
            ) : (
              <PreviewTicket {...applyControl}>{summary}</PreviewTicket>
            )}
          </div>
        </div>
      )}
    </>
  );
}
