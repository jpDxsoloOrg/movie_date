import { useRef, useState, type ChangeEvent } from "react";
import { useToast } from "../../hooks/useToast";
import { errorMessage } from "../../services/api";
import { Button } from "../Button";
import { Avatar } from "./Avatar";
import { cropAvatar } from "./cropAvatar";
import "./AvatarPicker.css";

export interface AvatarPickerProps {
  /** What to show now: a preview of the picked image, or the saved avatar. */
  imageUrl?: string | null;
  disabled?: boolean;
  /** Receives the image already cropped and resized for upload. */
  onPick: (image: Blob) => void;
}

export function AvatarPicker({ imageUrl, disabled = false, onPick }: AvatarPickerProps): JSX.Element {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [processing, setProcessing] = useState(false);

  const handleFile = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = event.target.files?.[0];
    // Otherwise picking the same file again after an error fires no change event.
    event.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("That file isn't an image.");
      return;
    }
    setProcessing(true);
    try {
      onPick(await cropAvatar(file));
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setProcessing(false);
    }
  };

  const openPicker = (): void => input.current?.click();
  const blocked = disabled || processing;

  return (
    <div className="room-avatar-picker">
      <button
        type="button"
        className="room-avatar-picker__preview"
        aria-label="Change profile photo"
        disabled={blocked}
        onClick={openPicker}
      >
        <Avatar url={imageUrl} size="lg" />
      </button>
      <Button variant="ghost" loading={processing} disabled={disabled} onClick={openPicker}>
        Change Photo
      </Button>
      <input
        ref={input}
        className="sr-only"
        type="file"
        accept="image/*"
        aria-label="Choose a profile photo"
        tabIndex={-1}
        onChange={(event) => void handleFile(event)}
      />
    </div>
  );
}
