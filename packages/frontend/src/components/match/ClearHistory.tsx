import { useState } from "react";
import { useToast } from "../../hooks/useToast";
import { MODE_COPY } from "../../mode/modeCopy";
import { api, errorMessage, type HistoryKind, type MediaType } from "../../services/api";
import { Button } from "../Button";
import { Modal } from "../Modal";

const COPY: Record<HistoryKind, { title: string; button: string; body: string }> = {
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

export interface ClearHistoryProps {
  kind: HistoryKind;
  mediaType: MediaType;
  onCleared: () => void;
}

export function ClearHistory({ kind, mediaType, onCleared }: ClearHistoryProps): JSX.Element {
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const copy = COPY[kind];

  async function clear(): Promise<void> {
    setClearing(true);
    try {
      await api.clearHistory(kind, mediaType);
      toast.success("History cleared");
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
              Clear
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
