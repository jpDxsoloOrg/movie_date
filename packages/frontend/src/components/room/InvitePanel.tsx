import { useState } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useBreakpoint } from "../../hooks/useBreakpoint";
import { useToast } from "../../hooks/useToast";
import { Button, IconButton } from "../Button";
import { Icon } from "../Icon";
import { Skeleton } from "../Skeleton";
import { inviteQrDataUrl } from "./inviteQr";
import { Ticket } from "./Ticket";
import "./InvitePanel.css";

function InviteQr({ link }: { link: string }): JSX.Element {
  const { data, error, loading, reload } = useAsyncData(() => inviteQrDataUrl(link), [link]);

  if (loading && !data) return <Skeleton shape="rect" className="room-invite__qr" />;
  if (error && !data) {
    return (
      <div className="room-invite__qr-failed" role="alert">
        <p>We couldn't draw the QR code.</p>
        <Button variant="ghost" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  }
  return <img className="room-invite__qr" src={data} alt={`QR code for ${link}`} />;
}

export interface InvitePanelProps {
  code: string;
  /**
   * `auto` keeps it behind a button on phones, where the person holding the phone is
   * usually the one sending the link. `always` is for a surface opened just to invite.
   */
  qr?: "auto" | "always";
}

export function InvitePanel({ code, qr = "auto" }: InvitePanelProps): JSX.Element {
  const toast = useToast();
  const onPhone = useBreakpoint() === "mobile";
  const [qrRequested, setQrRequested] = useState(false);
  const link = `${window.location.origin}/join/${code}`;
  const canShare = typeof navigator.share === "function";
  const qrHasToggle = qr === "auto" && onPhone;
  const showQr = !qrHasToggle || qrRequested;

  const copy = async (text: string, copiedMessage: string): Promise<void> => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(copiedMessage);
    } catch {
      toast.error("Couldn't copy. Select the text and copy it yourself.");
    }
  };

  const share = async (): Promise<void> => {
    try {
      await navigator.share({
        title: "Movie Date",
        text: `Join my Movie Date room with code ${code}`,
        url: link,
      });
    } catch (error) {
      // Closing the share sheet rejects too, and that isn't a failure.
      if (error instanceof DOMException && error.name === "AbortError") return;
      toast.error("Couldn't open sharing. Copy the link instead.");
    }
  };

  return (
    <section className="room-invite" aria-labelledby="room-invite-title">
      <Ticket
        main={
          <div className="room-invite__main">
            <div className="room-invite__heading">
              <h2 id="room-invite-title" className="room-invite__title">
                Invite someone
              </h2>
              <IconButton
                className="room-invite__copy-code"
                label="Copy room code"
                onClick={() => void copy(code, "Room code copied")}
              >
                <Icon name="copy" />
              </IconButton>
            </div>
            <p className="room-invite__code">
              <span className="sr-only">Room code </span>
              {code}
            </p>
            <p className="room-invite__hint">They enter this under Join Room, or just open your link.</p>
          </div>
        }
        stub={
          <div className="room-invite__stub">
            {showQr && <InviteQr link={link} />}
            <div className="room-invite__link-row">
              <input
                className="room-invite__link"
                aria-label="Invite link"
                value={link}
                readOnly
                onFocus={(event) => event.target.select()}
              />
              <IconButton label="Copy invite link" onClick={() => void copy(link, "Invite link copied")}>
                <Icon name="copy" />
              </IconButton>
            </div>
            {(canShare || qrHasToggle) && (
              <div className="room-invite__actions">
                {canShare && (
                  <Button onClick={() => void share()}>
                    <Icon name="share" />
                    Share
                  </Button>
                )}
                {qrHasToggle && (
                  <Button
                    variant="secondary"
                    aria-expanded={qrRequested}
                    onClick={() => setQrRequested((requested) => !requested)}
                  >
                    {qrRequested ? "Hide QR Code" : "Show QR Code"}
                  </Button>
                )}
              </div>
            )}
          </div>
        }
      />
    </section>
  );
}
