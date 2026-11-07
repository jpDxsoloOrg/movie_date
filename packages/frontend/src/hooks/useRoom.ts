import { useContext, useEffect, useRef } from "react";
import { RoomContext, type RoomContextValue } from "../context/RoomProvider";
import type { RoomEvent } from "../services/api";

export function useRoom(): RoomContextValue {
  const value = useContext(RoomContext);
  if (!value) throw new Error("useRoom must be used inside RoomProvider");
  return value;
}

/** Runs `listener` for every event on the caller's room, without resubscribing on re-render. */
export function useRoomEvents(listener: (event: RoomEvent) => void): void {
  const { subscribeEvents } = useRoom();
  const latest = useRef(listener);
  latest.current = listener;
  useEffect(() => subscribeEvents((event) => latest.current(event)), [subscribeEvents]);
}
