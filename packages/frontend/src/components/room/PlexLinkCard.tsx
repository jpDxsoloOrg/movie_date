import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRoom } from "../../hooks/useRoom";
import { useToast } from "../../hooks/useToast";
import { api, errorMessage } from "../../services/api";
import { Button } from "../Button";
import { Card } from "../Card";
import { Icon } from "../Icon";
import { Modal } from "../Modal";
import { CodeField } from "./CodeField";
import "./PlexLinkCard.css";

const CODE_LENGTH = 6;
/**
 * Inside this window the server answers `sent` and mails nothing, so a Resend
 * press here would claim a code that never comes.
 */
const RESEND_INTERVAL_MS = 60_000;

const onlyDigits = (raw: string): string => raw.replace(/\D/g, "").slice(0, CODE_LENGTH);

function useSecondsUntil(deadline: number): number {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setNow(Date.now());
    if (deadline <= Date.now()) return undefined;
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

function LinkedPanel(): JSX.Element {
  const toast = useToast();
  const { me, setMe, room } = useRoom();
  const [confirming, setConfirming] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const closeConfirm = (): void => {
    if (!unlinking) setConfirming(false);
  };

  const unlink = async (): Promise<void> => {
    setUnlinking(true);
    try {
      setMe(await api.unlinkPlex());
      toast.success("Plex Request unlinked");
    } catch (error) {
      toast.error(errorMessage(error));
      setUnlinking(false);
    }
  };

  return (
    <>
      <p className="room-plex__linked">
        <span className="room-plex__linked-mark">
          <Icon name="check" />
        </span>
        <span className="room-plex__linked-text">
          <strong>Linked</strong>
          <span className="room-plex__email">{me.email}</span>
        </span>
      </p>
      <p className="room-plex__copy">
        Your room can filter by what's on Plex, and you can ask for anything that's missing.
      </p>
      <Button variant="secondary" className="room-plex__unlink" onClick={() => setConfirming(true)}>
        Unlink
      </Button>

      <Modal
        open={confirming}
        onClose={closeConfirm}
        title="Unlink Plex Request?"
        actions={
          <>
            <Button variant="ghost" disabled={unlinking} onClick={closeConfirm}>
              Cancel
            </Button>
            <Button variant="brand" loading={unlinking} onClick={() => void unlink()}>
              Unlink
            </Button>
          </>
        }
      >
        {room.members.length > 1
          ? "You won't be able to request from here, and the Plex filter goes away unless someone else in your room has linked."
          : "You won't be able to request from here, and the Plex filter goes away."}{" "}
        You can link again whenever you like.
      </Modal>
    </>
  );
}

function LinkFlow(): JSX.Element {
  const toast = useToast();
  const { me, setMe, room } = useRoom();
  const [enteringCode, setEnteringCode] = useState(false);
  const [mailed, setMailed] = useState(false);
  const [code, setCode] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [resendAt, setResendAt] = useState(0);
  const secondsLeft = useSecondsUntil(resendAt);
  const flow = useRef<HTMLDivElement>(null);
  const hasSwitchedStep = useRef(false);

  // The button that was pressed has just gone, and focus would fall back to the page.
  useEffect(() => {
    if (hasSwitchedStep.current) flow.current?.querySelector<HTMLElement>("input, button")?.focus();
    hasSwitchedStep.current = true;
  }, [enteringCode]);

  const sendCode = async (): Promise<void> => {
    setSending(true);
    try {
      await api.startPlexLink();
      setResendAt(Date.now() + RESEND_INTERVAL_MS);
      setMailed(true);
      setEnteringCode(true);
      setCode("");
      setCodeError(null);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSending(false);
    }
  };

  const confirm = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    if (code.length < CODE_LENGTH) {
      setCodeError(`Enter all ${CODE_LENGTH} digits`);
      return;
    }
    setCodeError(null);
    setConfirming(true);
    try {
      setMe(await api.confirmPlexLink(code));
      toast.success("Plex Request linked");
    } catch (error) {
      setCodeError(errorMessage(error));
      setConfirming(false);
    }
  };

  if (!enteringCode) {
    return (
      <div ref={flow} className="room-plex__step" data-tour="plex-link">
        <p className="room-plex__copy">
          {room.plexAvailable
            ? "Someone in your room already linked theirs, so the Plex filter is on. Link yours to request what's missing too."
            : "Link it to filter your room by what's on Plex, and to ask for anything that's missing."}
        </p>
        <p className="room-plex__copy room-plex__copy--small">
          It has to be the Plex Request account with the same email as this profile.
        </p>
        <div className="room-plex__actions">
          <Button loading={sending} onClick={() => void sendCode()}>
            Email Me a Code
          </Button>
          <Button variant="ghost" disabled={sending} onClick={() => setEnteringCode(true)}>
            I Have a Code
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div ref={flow}>
      <form className="room-plex__step" onSubmit={(event) => void confirm(event)} noValidate>
        {/* Deliberately "if": the server won't say whether an account exists for this address. */}
        <p className="room-plex__copy" role="status">
          {mailed ? (
            <>
              If <span className="room-plex__email">{me.email}</span> has a Plex Request account, a code is on its way.
              It works for 10 minutes.
            </>
          ) : (
            "Enter the code from your latest email. It works for 10 minutes."
          )}
        </p>
        <CodeField
          label="6-digit code"
          length={CODE_LENGTH}
          clean={onlyDigits}
          value={code}
          error={codeError}
          inputMode="numeric"
          autoComplete="one-time-code"
          readOnly={confirming}
          onChange={(next) => {
            setCode(next);
            setCodeError(null);
          }}
        />
        <div className="room-plex__actions">
          <Button type="submit" className="room-plex__submit" loading={confirming}>
            Link Account
          </Button>
          <Button
            variant="ghost"
            disabled={confirming}
            onClick={() => {
              setEnteringCode(false);
              setCodeError(null);
            }}
          >
            Back
          </Button>
          <Button
            variant="ghost"
            disabled={secondsLeft > 0 || confirming}
            loading={sending}
            onClick={() => void sendCode()}
          >
            {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Resend Code"}
          </Button>
        </div>
      </form>
    </div>
  );
}

export function PlexLinkCard(): JSX.Element {
  const { me } = useRoom();

  return (
    <Card
      as="section"
      className="room-plex"
      title="Plex Request"
      subtitle={me.plexLinked ? undefined : "Bring your Plex library along."}
      action={
        <span className="room-plex__mark">
          <Icon name="play" />
        </span>
      }
    >
      {me.plexLinked ? <LinkedPanel /> : <LinkFlow />}
    </Card>
  );
}
