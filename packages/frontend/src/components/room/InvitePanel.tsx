import { useState } from "react";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useToast } from "../../hooks/useToast";
import { Button, IconButton } from "../Button";
import { Icon } from "../Icon";
import { Skeleton } from "../Skeleton";
import { ErrorState } from "../StateMessage";
import { inviteQrDataUrl } from "./inviteQr";
import "./InvitePanel.css";

function InviteQr({ link }: { link: string }): JSX.Element {
  const { data, error, loading, reload } = useAsyncData(() => inviteQrDataUrl(link), [link]);

  if (loading && !data) return <Skeleton shape="rect" className="room-invite__qr" />;
  if (error && !data) {
    return <ErrorState message="We couldn't draw the QR code." onRetry={() => void reload()} />;
  }
  return <img className="room-invite__qr" src={data} alt={`QR code for ${link}`} />;
}

export function InvitePanel({ code }: { code: string }): JSX.Element {
  const toast = useToast();
  const [showQr, setShowQr] = useState(false);
  const link = `${window.location.origin}/join/${code}`;
  const canShare = typeof navigator.share === "function";

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
      <h2 id="room-invite-title" className="room-invite__title">
        Invite someone
      </h2>

      <div className="room-invite__row">
        <p className="room-invite__code">
          <span className="sr-only">Room code </span>
          {code}
        </p>
        <IconButton label="Copy room code" onClick={() => void copy(code, "Room code copied")}>
          <Icon name="copy" />
        </IconButton>
      </div>

      <div className="room-invite__row">
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

      <div className="room-invite__actions">
        {canShare && (
          <Button onClick={() => void share()}>
            <Icon name="share" />
            Share
          </Button>
        )}
        <Button variant="secondary" aria-expanded={showQr} onClick={() => setShowQr((shown) => !shown)}>
          {showQr ? "Hide QR Code" : "Show QR Code"}
        </Button>
      </div>

      {showQr && <InviteQr link={link} />}
    </section>
  );
}
