import { useEffect, useRef, useState } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useRoom } from "../../hooks/useRoom";
import { useToast } from "../../hooks/useToast";
import { api, errorMessage, type MediaType, type PlexAvailability, type PlexStatus } from "../../services/api";
import { Button } from "../Button";
import { Modal } from "../Modal";
import { Skeleton } from "../Skeleton";
import { PlexMark } from "../PlexMark";
import "./PlexStatusPanel.css";

type BadgeTone = "ready" | "pending" | "missing";

const STATUS_COPY: Record<PlexAvailability, { label: string; note: string; tone: BadgeTone }> = {
  AVAILABLE: { label: "On Plex", note: "Ready to watch in the library.", tone: "ready" },
  MONITORED: { label: "Coming to Plex", note: "It's on the list, but there's no file yet.", tone: "pending" },
  REQUESTED: { label: "Requested on Plex", note: "A request is already in.", tone: "pending" },
  NOT_IN_LIBRARY: { label: "Not on Plex", note: "It isn't in the library yet.", tone: "missing" },
};

const REQUESTS_DOWN_NOTE = "Plex requests are unavailable right now.";
const SHOW_STATUS_DOWN_NOTE = "Plex status is unavailable right now.";
const PARTIAL_LABEL = "Partly on Plex";
/** A show in the library may have no files yet, so this can't promise it's ready (decision 60). */
const SHOW_AVAILABLE_NOTE = "It's in the library.";

/** Some seasons in the library: the API says AVAILABLE and lists what's missing. */
function isPartial(status: PlexStatus): boolean {
  return status.availability === "AVAILABLE" && (status.missingSeasons?.length ?? 0) > 0;
}

function missingSeasonsNote(seasons: readonly number[]): string {
  if (seasons.length === 1) return `Season ${seasons[0]} is missing from the library.`;
  const sorted = [...seasons].sort((first, second) => first - second);
  return `Seasons ${sorted.slice(0, -1).join(", ")} and ${sorted[sorted.length - 1]} are missing from the library.`;
}

function statusNote(status: PlexStatus, mediaType: MediaType): string {
  if (isPartial(status)) return missingSeasonsNote(status.missingSeasons ?? []);
  // The backend reports an outage as a missing title that can't be requested.
  if (status.availability === "NOT_IN_LIBRARY" && !status.canRequest) return REQUESTS_DOWN_NOTE;
  if (mediaType === "TV" && status.availability === "AVAILABLE") return SHOW_AVAILABLE_NOTE;
  return STATUS_COPY[status.availability].note;
}

function Badge({ label, tone }: { label: string; tone: BadgeTone }): JSX.Element {
  return (
    <span className={`plex-status__badge plex-status__badge--${tone}`}>
      <PlexMark className="plex-status__mark" />
      {label}
    </span>
  );
}

interface PanelProps {
  movieId: number;
  movieTitle: string;
  mediaType: MediaType;
  onGradient: boolean;
}

/** One season leaves nothing to pick, and a show with no count asks for all of it. */
function seasonNumbers(seasonCount: number | null | undefined): number[] {
  const count = seasonCount ?? 0;
  return count > 1 ? Array.from({ length: count }, (_, index) => index + 1) : [];
}

interface SeasonPickerProps {
  seasons: readonly number[];
  chosen: ReadonlySet<number>;
  onChange: (chosen: Set<number>) => void;
}

function SeasonPicker({ seasons, chosen, onChange }: SeasonPickerProps): JSX.Element {
  function toggle(season: number): void {
    const next = new Set(chosen);
    if (!next.delete(season)) next.add(season);
    onChange(next);
  }

  return (
    <fieldset className="plex-status__seasons">
      <legend className="plex-status__seasons-legend">Seasons</legend>
      <label className="plex-status__season plex-status__season--all">
        <input
          type="checkbox"
          checked={chosen.size === seasons.length}
          onChange={(event) => onChange(new Set(event.target.checked ? seasons : []))}
        />
        All seasons
      </label>
      <div className="plex-status__season-list">
        {seasons.map((season) => (
          <label key={season} className="plex-status__season">
            <input type="checkbox" checked={chosen.has(season)} onChange={() => toggle(season)} />
            Season {season}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function LinkedPanel({ movieId, movieTitle, mediaType, onGradient }: PanelProps): JSX.Element | null {
  const toast = useToast();
  const { data: status, error, reload, setData } = useAsyncData(
    () => api.plexStatus(movieId, mediaType),
    [movieId, mediaType],
  );
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  const requested = useRef(false);
  const canRequest = status?.canRequest ?? false;
  const seasons = seasonNumbers(status?.seasonCount);
  const [chosenSeasons, setChosenSeasons] = useState<ReadonlySet<number>>(new Set());

  // The button that opened the dialog is gone by now, and focus would drop out of the sheet.
  useEffect(() => {
    if (canRequest || !requested.current) return;
    requested.current = false;
    summary.current?.focus();
  }, [canRequest]);

  async function sendRequest(): Promise<void> {
    setSending(true);
    try {
      const partial = chosenSeasons.size < seasons.length;
      const next = await api.requestOnPlex(
        movieId,
        mediaType,
        partial ? [...chosenSeasons].sort((first, second) => first - second) : undefined,
      );
      requested.current = true;
      setData(next);
      setConfirming(false);
      if (next.availability === "REQUESTED") toast.success(`Requested ${movieTitle} on Plex`);
    } catch (caught) {
      // The reload can take the button away too.
      requested.current = true;
      setConfirming(false);
      toast.error(errorMessage(caught));
      void reload();
    } finally {
      setSending(false);
    }
  }

  const classes = onGradient ? "plex-status plex-status--on-gradient" : "plex-status";

  if (status === null) return null;
  if (status === undefined) {
    if (error) {
      return (
        <div className={classes}>
          <div className="plex-status__summary">
            <Badge label="Plex" tone="missing" />
            <span className="plex-status__note">{mediaType === "TV" ? SHOW_STATUS_DOWN_NOTE : REQUESTS_DOWN_NOTE}</span>
          </div>
        </div>
      );
    }
    return (
      <div className={classes} role="status" aria-label="Checking Plex">
        <Skeleton shape="chip" className="plex-status__skeleton" />
      </div>
    );
  }

  const copy = STATUS_COPY[status.availability];
  const partial = isPartial(status);
  return (
    <div className={classes}>
      <div ref={summary} className="plex-status__summary" tabIndex={-1}>
        <Badge label={partial ? PARTIAL_LABEL : copy.label} tone={partial ? "pending" : copy.tone} />
        <span className="plex-status__note">{statusNote(status, mediaType)}</span>
      </div>
      {canRequest && (
        <Button
          className="plex-status__request"
          onClick={() => {
            setChosenSeasons(new Set(seasons));
            setConfirming(true);
          }}
        >
          Request on Plex
        </Button>
      )}
      <Modal
        open={confirming}
        onClose={() => {
          // Closing mid-send would look like cancelling a request that's going through.
          if (!sending) setConfirming(false);
        }}
        title={`Request ${movieTitle}?`}
        actions={
          <>
            <Button variant="ghost" disabled={sending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button
              loading={sending}
              disabled={seasons.length > 0 && chosenSeasons.size === 0}
              onClick={() => void sendRequest()}
            >
              Request
            </Button>
          </>
        }
      >
        {seasons.length > 0 && (
          <SeasonPicker seasons={seasons} chosen={chosenSeasons} onChange={setChosenSeasons} />
        )}
        <p className="plex-status__confirm">
          This goes to Plex Request from your linked account. If your account is trusted, the download starts straight
          away.
        </p>
      </Modal>
    </div>
  );
}

export interface PlexStatusPanelProps {
  movieId: number;
  movieTitle: string;
  mediaType?: MediaType;
  onGradient?: boolean;
}

/** Status badge and Request on Plex. Renders nothing for someone without a linked account. */
export function PlexStatusPanel({
  movieId,
  movieTitle,
  mediaType = "MOVIE",
  onGradient = false,
}: PlexStatusPanelProps): JSX.Element | null {
  const { me } = useRoom();
  if (!me.plexLinked) return null;
  // Keyed because useAsyncData holds on to the last title's status during a reload.
  return (
    <LinkedPanel
      key={`${mediaType}:${movieId}`}
      movieId={movieId}
      movieTitle={movieTitle}
      mediaType={mediaType}
      onGradient={onGradient}
    />
  );
}
