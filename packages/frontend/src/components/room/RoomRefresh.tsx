import { useAsyncData } from "../../hooks/useAsyncData";
import { useRoom } from "../../hooks/useRoom";
import { Button } from "../Button";
import "./RoomRefresh.css";

/**
 * Live events keep `room` current only while the socket is up, so screens that
 * show members refetch on arrival and say when what's on screen may be stale.
 */
export function RoomRefresh(): JSX.Element | null {
  const { refreshRoom, realtimeStatus } = useRoom();
  const { error, loading, reload } = useAsyncData(refreshRoom, [refreshRoom]);

  if (error && !loading) {
    return (
      <div className="room-refresh" role="alert">
        <p>We couldn't refresh your room, so this may be out of date.</p>
        <Button variant="secondary" onClick={() => void reload()}>
          Try again
        </Button>
      </div>
    );
  }
  if (realtimeStatus === "offline") {
    return (
      <p className="room-refresh" role="status">
        Reconnecting. Live updates are paused.
      </p>
    );
  }
  return null;
}
