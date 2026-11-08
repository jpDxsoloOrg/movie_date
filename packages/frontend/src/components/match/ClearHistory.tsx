import { useState } from "react";
import { useRoom } from "../../hooks/useRoom";
import { useToast } from "../../hooks/useToast";
import { MODE_COPY } from "../../mode/modeCopy";
import { api, errorMessage, type HistoryKind, type MediaType } from "../../services/api";
import { Button } from "../Button";
import { Modal } from "../Modal";

interface ClearCopy {
  title: string;
  button: string;
  body: string;
}

const COPY: Record<HistoryKind, ClearCopy> = {
  MATCHES: {
    title: "Clear your match history?",
    button: "Clear match history",
    body: "Only you lose this list. Everyone else in the room keeps theirs, and any new match still shows up here.",
  },
  SWIPES: {
    title: "Clear your swipe history?",
    button: "Clear swipe history",
    body: "This only empties the list. Your swipes still count, so these titles stay out of your deck and your likes can still match.",
  },
};

/** Alone in a room nobody else's round is at stake, so swipes can be taken back for real. */
function resetCopy(mediaType: MediaType): ClearCopy {
  const copy = MODE_COPY[mediaType];
  return {
    title: "Reset your swipes?",
    button: "Reset your swipes",
    body: `Every ${copy.noun.one} you swiped ${copy.likedLabel} or ${copy.passedLabel} goes back into your deck, and this list starts empty. Your matches stay.`,
  };
}

export interface ClearHistoryProps {
  kind: HistoryKind;
  mediaType: MediaType;
  /** The caller is the only one in the room, so clearing swipes resets them. */
  solo?: boolean;
  onCleared: () => void;
}

export function ClearHistory({ kind, mediaType, solo = false, onCleared }: ClearHistoryProps): JSX.Element {
  const toast = useToast();
  const { setRoom } = useRoom();
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const resetting = solo && kind === "SWIPES";
  const copy = resetting ? resetCopy(mediaType) : COPY[kind];

  async function clear(): Promise<void> {
    setClearing(true);
    try {
      if (resetting) {
        setRoom(await api.resetSwipes(mediaType));
        toast.success("Swipes reset");
      } else {
        await api.clearHistory(kind, mediaType);
        toast.success("History cleared");
      }
      onCleared();
    } catch (caught) {
      toast.error(errorMessage(caught));
      setClearing(false);
      setConfirming(false);
    }
  }

  return (
    <>
      <Button className="history-clear" variant="ghost" block onClick={() => setConfirming(true)}>
        {copy.button}
      </Button>
      <Modal
        open={confirming}
        onClose={() => {
          if (!clearing) setConfirming(false);
        }}
        title={copy.title}
        actions={
          <>
            <Button variant="ghost" disabled={clearing} onClick={() => setConfirming(false)}>
              Cancel
            </Button>
            <Button loading={clearing} onClick={() => void clear()}>
              {resetting ? "Reset" : "Clear"}
            </Button>
          </>
        }
      >
        <p>
          {copy.body} This covers {MODE_COPY[mediaType].switchLabel} only, and it can't be undone.
        </p>
      </Modal>
    </>
  );
}
