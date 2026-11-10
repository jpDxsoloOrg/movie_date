import { BottomSheet } from "../BottomSheet";
import { Button } from "../Button";
import { Icon } from "../Icon";
import { Skeleton } from "../Skeleton";
import { useAsyncData } from "../../hooks/useAsyncData";
import { useToast } from "../../hooks/useToast";
import { useMode } from "../../mode/ModeProvider";
import "./InviteSheet.css";

function QrCode({ link }: { link: string }): JSX.Element {
  const { data: image, error } = useAsyncData(async () => {
    // Only this sheet needs it, so it stays out of the bundle everyone loads.
    const { toDataURL } = await import("qrcode");
    return toDataURL(link, { width: 480, margin: 1 });
  }, [link]);

  if (image) return <img className="deck-invite__qr" src={image} alt="QR code for the invite link" />;
  if (error) return <p className="deck-invite__hint">Couldn't draw the QR code. Share the link instead.</p>;
  return (
    <div role="status" aria-label="Loading QR code">
      <Skeleton shape="rect" className="deck-invite__qr" />
    </div>
  );
}

function InviteBody({ code }: { code: string }): JSX.Element {
  const toast = useToast();
  const { copy } = useMode();
  const link = `${window.location.origin}/join/${code}`;
  const canShare = typeof navigator.share === "function";

  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Invite link copied");
    } catch {
      toast.error("Couldn't copy it. Select the link above and copy it yourself.");
    }
  };

  const shareLink = async (): Promise<void> => {
    try {
      await navigator.share({ title: copy.appTitle, text: copy.inviteText, url: link });
    } catch (error) {
      // Dismissing the share sheet rejects too, and that isn't a failure.
      if (!(error instanceof DOMException && error.name === "AbortError")) await copyLink();
    }
  };

  return (
    <div className="deck-invite">
      <h2 className="deck-invite__title">Invite someone</h2>
      <p className="deck-invite__hint">Scan the code, open the link, or enter the room code under Join Room.</p>
      <p className="deck-invite__code">{code}</p>
      <QrCode link={link} />
      <p className="deck-invite__link">{link}</p>
      <div className="deck-invite__actions">
        {canShare && (
          <Button block onClick={() => void shareLink()}>
            <Icon name="share" /> Share
          </Button>
        )}
        <Button block variant={canShare ? "secondary" : "primary"} onClick={() => void copyLink()}>
          <Icon name="copy" /> Copy Link
        </Button>
      </div>
    </div>
  );
}

export interface InviteSheetProps {
  open: boolean;
  onClose: () => void;
  code: string;
}

export function InviteSheet({ open, onClose, code }: InviteSheetProps): JSX.Element {
  return (
    <BottomSheet open={open} onClose={onClose} label="Invite to room" data-tour="invite-sheet">
      <InviteBody code={code} />
    </BottomSheet>
  );
}
