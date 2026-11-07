import { effectiveThreshold, maxThreshold, MIN_MATCH_THRESHOLD, type ThresholdSettings } from "@movie-date/core";
import { useState, type FormEvent } from "react";
import { Button } from "../components/Button";
import { RoomRefresh } from "../components/room/RoomRefresh";
import { useRoom } from "../hooks/useRoom";
import { useToast } from "../hooks/useToast";
import { api, errorMessage } from "../services/api";
import "./Settings.css";

export default function Settings(): JSX.Element {
  const toast = useToast();
  const { room, setRoom } = useRoom();
  // Null until edited, so a roommate's change or a member joining shows here live.
  const [draft, setDraft] = useState<ThresholdSettings | null>(null);
  const [saving, setSaving] = useState(false);

  const memberCount = room.members.length;
  const sliderMax = maxThreshold(memberCount);
  const requireMajority = draft?.requireMajority ?? room.requireMajority;
  const threshold = effectiveThreshold(draft ?? room, memberCount);
  const changed =
    requireMajority !== room.requireMajority || threshold !== effectiveThreshold(room, memberCount);

  const save = async (event: FormEvent): Promise<void> => {
    event.preventDefault();
    setSaving(true);
    try {
      setRoom(await api.updateRoomSettings(threshold, requireMajority));
      setDraft(null);
      toast.success("Settings saved");
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSaving(false);
    }
  };

  const hint = requireMajority
    ? "Half the room, rounded up, and it follows as people join or leave."
    : sliderMax === MIN_MATCH_THRESHOLD
      ? "Invite more people to raise this."
      : "How many people must like a movie for it to match.";

  return (
    <form className="settings" onSubmit={(event) => void save(event)}>
      <RoomRefresh />

      <div className="settings__group">
        <label className="settings__heading" htmlFor="settings-threshold">
          Matches Required
        </label>
        <div className="settings__slider-row">
          <input
            id="settings-threshold"
            className="settings__slider"
            type="range"
            min={MIN_MATCH_THRESHOLD}
            max={sliderMax}
            step={1}
            value={threshold}
            disabled={requireMajority || sliderMax === MIN_MATCH_THRESHOLD}
            aria-describedby="settings-threshold-hint"
            onChange={(event) =>
              setDraft({ matchThreshold: Number(event.target.value), requireMajority })
            }
          />
          <output className="settings__value" htmlFor="settings-threshold">
            {threshold}
          </output>
        </div>
        <p id="settings-threshold-hint" className="settings__hint">
          {hint}
        </p>
      </div>

      <label className="settings__check">
        <span>Require Majority</span>
        <input
          className="settings__checkbox"
          type="checkbox"
          checked={requireMajority}
          onChange={(event) =>
            setDraft({ matchThreshold: threshold, requireMajority: event.target.checked })
          }
        />
      </label>

      <Button type="submit" block loading={saving} disabled={!changed}>
        Save Settings
      </Button>
    </form>
  );
}
