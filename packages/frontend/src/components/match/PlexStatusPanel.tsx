import { useEffect, useRef, useState } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useRoom } from "../../hooks/useRoom";
import { useToast } from "../../hooks/useToast";
import { api, errorMessage, type PlexAvailability, type PlexStatus } from "../../services/api";
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

function statusNote(status: PlexStatus): string {
  // The backend reports an outage as a missing title that can't be requested.
  if (status.availability === "NOT_IN_LIBRARY" && !status.canRequest) return REQUESTS_DOWN_NOTE;
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
  onGradient: boolean;
}

function LinkedPanel({ movieId, movieTitle, onGradient }: PanelProps): JSX.Element | null {
  const toast = useToast();
  const { data: status, error, reload, setData } = useAsyncData(() => api.plexStatus(movieId), [movieId]);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const summary = useRef<HTMLDivElement>(null);
  const requested = useRef(false);
  const canRequest = status?.canRequest ?? false;

  // The button that opened the dialog is gone by now, and focus would drop out of the sheet.
  useEffect(() => {
    if (requested.current && !canRequest) summary.current?.focus();
    requested.current = false;
  }, [canRequest]);

  async function sendRequest(): Promise<void> {
    setSending(true);
    try {
      const next = await api.requestOnPlex(movieId);
      requested.current = true;
      setData(next);
      setConfirming(false);
      if (next.availability === "REQUESTED") toast.success(`Requested ${movieTitle} on Plex`);
    } catch (caught) {
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
            <span className="plex-status__note">{REQUESTS_DOWN_NOTE}</span>
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
  return (
    <div className={classes}>
      <div ref={summary} className="plex-status__summary" tabIndex={-1}>
        <Badge label={copy.label} tone={copy.tone} />
        <span className="plex-status__note">{statusNote(status)}</span>
      </div>
      {canRequest && (
        <Button className="plex-status__request" onClick={() => setConfirming(true)}>
          Request on Plex
        </Button>
      )}
      <Modal
        open={confirming}
        onClose={() => setConfirming(false)}
        title={`Request ${movieTitle}?`}
        actions={
          <>
            <Button variant="ghost" disabled={sending} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button loading={sending} onClick={() => void sendRequest()}>
              Request
            </Button>
          </>
        }
      >
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
  onGradient?: boolean;
}

/** Status badge and Request on Plex. Renders nothing for someone without a linked account. */
export function PlexStatusPanel({ movieId, movieTitle, onGradient = false }: PlexStatusPanelProps): JSX.Element | null {
  const { me } = useRoom();
  if (!me.plexLinked) return null;
  // Keyed because useAsyncData holds on to the last title's status during a reload.
  return <LinkedPanel key={movieId} movieId={movieId} movieTitle={movieTitle} onGradient={onGradient} />;
}
