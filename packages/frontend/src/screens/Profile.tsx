import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../components/Button";
import { TextField } from "../components/TextField";
import { AvatarPicker } from "../components/room/AvatarPicker";
import { AVATAR_CONTENT_TYPE } from "../components/room/cropAvatar";
import { useRoom } from "../hooks/useRoom";
import { useToast } from "../hooks/useToast";
import { api, errorMessage } from "../services/api";
import "./Profile.css";

const MAX_DISPLAY_NAME_LENGTH = 50;

interface PendingPhoto {
  image: Blob;
  previewUrl: string;
  /** Set once uploaded, so retrying a failed save doesn't upload it twice. */
  key?: string;
}

export default function Profile(): JSX.Element {
  const toast = useToast();
  const { me, setMe } = useRoom();
  const [displayName, setDisplayName] = useState(me.displayName);
  const [nameError, setNameError] = useState<string | null>(null);
  const [photo, setPhoto] = useState<PendingPhoto | null>(null);
  const [saving, setSaving] = useState(false);

  const previewUrl = photo?.previewUrl;
  useEffect(() => {
    if (!previewUrl) return undefined;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const pickPhoto = (image: Blob): void => {
    setPhoto({ image, previewUrl: URL.createObjectURL(image) });
  };

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setNameError("Please enter a display name");
      return;
    }
    setNameError(null);
    setSaving(true);
    try {
      let avatarKey = photo?.key;
      if (photo && !avatarKey) {
        avatarKey = await api.uploadAvatar(photo.image, AVATAR_CONTENT_TYPE);
        setPhoto({ ...photo, key: avatarKey });
      }
      const profile = await api.updateProfile({ displayName: name, avatarKey });
      setMe(profile);
      setDisplayName(profile.displayName);
      setPhoto(null);
      toast.success("Profile saved!");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="profile" onSubmit={(event) => void save(event)} noValidate>
      <AvatarPicker imageUrl={previewUrl ?? me.avatarUrl} disabled={saving} onPick={pickPhoto} />
      <p className="profile__email">{me.email}</p>
      <TextField
        className="profile__field"
        label="Display Name"
        value={displayName}
        error={nameError}
        maxLength={MAX_DISPLAY_NAME_LENGTH}
        autoComplete="nickname"
        onChange={(event) => setDisplayName(event.target.value)}
      />
      <Button type="submit" block loading={saving}>
        Save
      </Button>
    </form>
  );
}
