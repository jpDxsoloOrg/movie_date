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
import { rangeLabel, releaseDateError, type RangeDefault, type ReleaseDates } from "../components/filters/releaseRange";
import { ServicePicker } from "../components/filters/ServicePicker";
import { CommitmentPicker, ShowStatusPicker } from "../components/filters/ShowPicks";
import { commitmentLabel, showStatusLabel } from "../components/filters/showFilters";
import { useFilterPreview } from "../components/filters/useFilterPreview";
import { useAsyncData } from "../hooks/useAsyncData";
import { useBreakpoint } from "../hooks/useBreakpoint";
import { useRoom } from "../hooks/useRoom";
import { useToast } from "../hooks/useToast";
import { useMode } from "../mode/ModeProvider";
import { actorsPath, homePath } from "../mode/modeRoutes";
import { api, errorMessage, type FiltersInput, type MediaType } from "../services/api";
import "./Filters.css";

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
function toSavedFilters(form: FiltersInput, mediaType: MediaType): FiltersInput {
  const saved = { ...form, services: normaliseServices(form.services) };
  return mediaType === "TV" ? saved : withDefaultReleaseDate(saved, new Date());
}

/** The date fields speak in release dates; a show's live under first-air names. */
function formDates(form: FiltersInput, mediaType: MediaType): ReleaseDates {
  return mediaType === "TV"
    ? { releaseDateGte: form.firstAirDateGte, releaseDateLte: form.firstAirDateLte }
    : { releaseDateGte: form.releaseDateGte, releaseDateLte: form.releaseDateLte };
}

function datesPatch(dates: ReleaseDates, mediaType: MediaType): Partial<FiltersInput> {
  return mediaType === "TV"
    ? { firstAirDateGte: dates.releaseDateGte, firstAirDateLte: dates.releaseDateLte }
    : dates;
}

function ModeFilters(): JSX.Element {
  const { room, setRoom } = useRoom();
  const { mode: mediaType, copy } = useMode();
  const isShows = mediaType === "TV";
  const rangeDefault: RangeDefault = isShows ? "any-time" : "this-year";
  const roomFilters = isShows ? room.tvFilters : room.filters;
  const navigate = useNavigate();
  const toast = useToast();
  const breakpoint = useBreakpoint();
  const genres = useAsyncData(() => api.genres(mediaType), []);
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
    const draft = peekFilterDraft(room.id, mediaType);
    return draft ? { roomId: room.id, draft } : null;
  });
  const hasEdits = edits?.roomId === room.id;
  const form = hasEdits ? edits.draft : roomFilters;

  useEffect(() => clearFilterDraft(), []);

  const now = new Date();
  const dates = formDates(form, mediaType);
  const dateError = releaseDateError(dates, now, rangeDefault);
  const preview = useFilterPreview(dateError ? null : toSavedFilters(form, mediaType), mediaType);

  const change = (patch: Partial<FiltersInput>): void => {
    setEdits({ roomId: room.id, draft: { ...form, ...patch } });
  };

  const openActors = (): void => {
    if (hasEdits) stashFilterDraft(room.id, form, mediaType);
    navigate(actorsPath(mediaType));
  };

  const apply = async (): Promise<void> => {
    if (dateError) return;
    setSaving(true);
    try {
      setRoom(await api.updateFilters(toSavedFilters(form, mediaType), mediaType));
      navigate(homePath(mediaType));
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
  const dateLabel = rangeLabel(dates, now, rangeDefault);
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
            onRemove: () => change(datesPatch({ releaseDateGte: null, releaseDateLte: null }, mediaType)),
          },
        ]
      : []),
    ...(form.showStatus
      ? [{ id: "status", label: showStatusLabel(form.showStatus), onRemove: () => change({ showStatus: null }) }]
      : []),
    ...(form.commitment
      ? [{ id: "commitment", label: commitmentLabel(form.commitment), onRemove: () => change({ commitment: null }) }]
      : []),
  ];

  // Only saving fills in the default start, so a room that's never saved deals everything.
  const movieEmptyText = isUnfiltered(room.filters)
    ? `The deck has every ${copy.noun.one} for now. Apply with nothing picked narrows it to this year’s.`
    : `Nothing picked, so Apply deals this year’s ${copy.noun.other} on any service.`;
  const emptyText = isShows ? `Nothing picked, so the deck has every ${copy.noun.one}.` : movieEmptyText;

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
      {isShows && (
        <>
          <ShowStatusPicker value={form.showStatus} onChange={(showStatus) => change({ showStatus })} />
          <CommitmentPicker value={form.commitment} onChange={(commitment) => change({ commitment })} />
        </>
      )}
      <ReleaseRange
        title={copy.dateTitle}
        dates={dates}
        error={dateError}
        rangeDefault={rangeDefault}
        onChange={(next) => change(datesPatch(next, mediaType))}
      />
    </form>
  );

  const applyControl: ApplyControlProps = {
    preview,
    noun: copy.noun,
    problem: dateError ? copy.dateProblem : null,
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
          onClose={() => navigate(homePath(mediaType))}
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

/** Keyed so a form can't carry one mode's draft or genres into the other. */
export default function Filters(): JSX.Element {
  const { mode } = useMode();
  return <ModeFilters key={mode} />;
}
