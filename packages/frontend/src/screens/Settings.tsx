import { effectiveThreshold, maxThreshold, MIN_MATCH_THRESHOLD, type ThresholdSettings } from "@movie-date/core";
import { useState, type FormEvent } from "react";
import { Button } from "../components/Button";
import { Card } from "../components/Card";
import { RoomRefresh } from "../components/room/RoomRefresh";
import { SeatRow } from "../components/room/SeatRow";
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
      : "How many people must say yes for it to be a match.";

  const verdict =
    memberCount < MIN_MATCH_THRESHOLD
      ? `Once someone joins, ${threshold} yeses will make a match.`
      : threshold === memberCount
        ? "Everyone in the room has to say yes."
        : `${threshold} of the ${memberCount} people in the room have to say yes.`;

  return (
    <form className="settings md-page-wide" onSubmit={(event) => void save(event)}>
      <RoomRefresh />

      <Card variant="raised" className="settings__preview">
        <p className="settings__eyebrow">What makes a match</p>
        <SeatRow seats={sliderMax} taken={threshold} />
        <p className="settings__verdict">{verdict}</p>
      </Card>

      <Card className="settings__controls">
        <div className="settings__group">
          <div className="settings__slider-heading">
            <label className="settings__heading" htmlFor="settings-threshold">
              Matches Required
            </label>
            <output className="settings__value" htmlFor="settings-threshold">
              {threshold}
            </output>
          </div>
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
          <p id="settings-threshold-hint" className="settings__hint">
            {hint}
          </p>
        </div>

        <div className="settings__check">
          <div className="settings__check-text">
            <label className="settings__heading" htmlFor="settings-majority">
              Require Majority
            </label>
            <p id="settings-majority-hint" className="settings__hint">
              Keeps the number at half the room.
            </p>
          </div>
          <input
            id="settings-majority"
            className="settings__switch"
            type="checkbox"
            checked={requireMajority}
            aria-describedby="settings-majority-hint"
            onChange={(event) =>
              setDraft({ matchThreshold: threshold, requireMajority: event.target.checked })
            }
          />
        </div>

        <Button type="submit" block loading={saving} disabled={!changed}>
          Save Settings
        </Button>
      </Card>
    </form>
  );
}
