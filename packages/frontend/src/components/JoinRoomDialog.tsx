import { normaliseRoomCode, ROOM_CODE_LENGTH } from "@movie-date/core";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useRoom } from "../hooks/useRoom";
import { useToast } from "../hooks/useToast";
import { api, errorMessage } from "../services/api";
import { Button } from "./Button";
import { Modal } from "./Modal";
import { CodeField } from "./room/CodeField";

const cleanCode = (raw: string): string => normaliseRoomCode(raw).slice(0, ROOM_CODE_LENGTH);

export interface JoinRoomDialogProps {
  open: boolean;
  onClose: () => void;
}

function JoinRoomForm({ onClose }: { onClose: () => void }): JSX.Element {
  const formId = useId();
  const navigate = useNavigate();
  const toast = useToast();
  const { setRoom } = useRoom();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const form = useRef<HTMLFormElement>(null);

  // Not autoFocus: that fires before Modal's trap records the opener, so focus
  // wouldn't return to the Join Room button. This effect runs after the trap's.
  useEffect(() => {
    form.current?.querySelector("input")?.focus();
  }, []);

  const close = (): void => {
    if (!joining) onClose();
  };

  const submit = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const normalised = normaliseRoomCode(code);
    if (!normalised) {
      setError("Enter a room code");
      return;
    }
    setError(null);
    setJoining(true);
    try {
      setRoom(await api.joinRoom(normalised));
      toast.success(`Joined room ${normalised}`);
      onClose();
      navigate("/");
    } catch (caught) {
      setError(errorMessage(caught));
      setJoining(false);
    }
  };

  return (
    <Modal
      open
      onClose={close}
      title="Join Room"
      actions={
        <>
          <Button variant="ghost" disabled={joining} onClick={close}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={joining}>
            Submit
          </Button>
        </>
      }
    >
      <form ref={form} id={formId} onSubmit={(event) => void submit(event)} noValidate>
        <CodeField
          label="Enter Room Code"
          hint="It's on the Room Members page of whoever invited you."
          length={ROOM_CODE_LENGTH}
          clean={cleanCode}
          value={code}
          error={error}
          autoComplete="off"
          autoCapitalize="characters"
          onChange={setCode}
        />
      </form>
    </Modal>
  );
}

/** The form mounts only while open, so each opening starts blank. */
export default function JoinRoomDialog({ open, onClose }: JoinRoomDialogProps): JSX.Element | null {
  return open ? <JoinRoomForm onClose={onClose} /> : null;
}
