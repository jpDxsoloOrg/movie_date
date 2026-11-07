import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ErrorState } from "../components/StateMessage";
import { SkeletonPage } from "../components/Skeleton";
import { useToast } from "../hooks/useToast";
import { api, type Match, type Member, type Profile, type Room, type RoomEvent } from "../services/api";
import { subscribeToRoom, type RealtimeStatus } from "../services/realtime";

export type RoomEventListener = (event: RoomEvent) => void;

export interface RoomContextValue {
  me: Profile;
  room: Room;
  realtimeStatus: RealtimeStatus;
  /** Changes whenever the deck is out of date. Use it as a dependency or a key. */
  deckVersion: number;
  /** Apply the Room a mutation returned. */
  setRoom: (room: Room) => void;
  /** Apply the Profile updateProfile returned. */
  setMe: (profile: Profile) => void;
  refreshRoom: () => Promise<void>;
  /** Route to the match screen; pass SwipeResult.match here. */
  goToMatch: (match: Match) => void;
  subscribeEvents: (listener: RoomEventListener) => () => void;
}

/** What /match/:matchId receives in router state when the app has the match in hand. */
export interface MatchRouteState {
  match?: Match;
}

export const RoomContext = createContext<RoomContextValue | null>(null);

const MATCH_PATH = /^\/match\/([^/]+)/;

/** A threshold or member change leaves the deck valid; these don't. */
function deckKey(room: Room): string {
  return JSON.stringify([room.id, room.round, room.filters]);
}

function memberChanges(before: Member[], after: Member[]): { joined: Member[]; left: Member[] } {
  const beforeIds = new Set(before.map((member) => member.userId));
  const afterIds = new Set(after.map((member) => member.userId));
  return {
    joined: after.filter((member) => !beforeIds.has(member.userId)),
    left: before.filter((member) => !afterIds.has(member.userId)),
  };
}

export function RoomProvider({ children }: { children: ReactNode }): JSX.Element {
  const { pathname } = useLocation();
  // useNavigate returns a new function per location. Depending on it directly
  // would redial the socket and reload the room on every route change.
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  const toast = useToast();

  const [me, setMe] = useState<Profile | null>(null);
  const [room, setRoomState] = useState<Room | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [deckVersion, setDeckVersion] = useState(0);

  const roomRef = useRef<Room | null>(null);
  const roomRequest = useRef(0);
  const loading = useRef(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const listeners = useRef(new Set<RoomEventListener>());
  // Each match routes a person once, so leaving the match screen by the drawer
  // doesn't bounce them back on the next focus while the round still has it.
  const routedMatchIds = useRef(new Set<string>());

  const applyRoom = useCallback((next: Room) => {
    const previous = roomRef.current;
    roomRef.current = next;
    setRoomState(next);
    if (previous && deckKey(previous) !== deckKey(next)) {
      setDeckVersion((version) => version + 1);
    }
  }, []);

  const setRoom = useCallback(
    (next: Room) => {
      // Whatever was in flight predates this mutation.
      roomRequest.current += 1;
      applyRoom(next);
    },
    [applyRoom],
  );

  const fetchRoom = useCallback(async (): Promise<Room | null> => {
    roomRequest.current += 1;
    const request = roomRequest.current;
    const next = await api.myRoom();
    if (request !== roomRequest.current) return null;
    applyRoom(next);
    return next;
  }, [applyRoom]);

  const refreshRoom = useCallback(async () => {
    await fetchRoom();
  }, [fetchRoom]);

  const routeToMatch = useCallback(
    (matchId: string, match?: Match) => {
      if (routedMatchIds.current.has(matchId)) return;
      // Someone reading a match isn't pulled off it. Leaving the screen re-checks
      // pendingMatch, so this one isn't lost.
      if (MATCH_PATH.test(pathnameRef.current)) return;
      routedMatchIds.current.add(matchId);
      const state: MatchRouteState = { match };
      navigateRef.current(`/match/${matchId}`, { state });
    },
    [],
  );

  const goToMatch = useCallback((match: Match) => routeToMatch(match.id, match), [routeToMatch]);

  const checkPendingMatch = useCallback(async () => {
    const pending = await api.pendingMatch();
    if (pending) routeToMatch(pending.id, pending);
  }, [routeToMatch]);

  const load = useCallback(async () => {
    if (loading.current) return;
    loading.current = true;
    setLoadFailed(false);
    try {
      // `me` first: it creates the profile and room that the other two read.
      setMe(await api.me());
      await Promise.all([fetchRoom(), checkPendingMatch()]);
    } catch {
      setLoadFailed(true);
    } finally {
      loading.current = false;
    }
  }, [fetchRoom, checkPendingMatch]);

  useEffect(() => {
    void load();
  }, [load]);

  const announceMemberChanges = useCallback(async () => {
    const before = roomRef.current;
    const after = await fetchRoom();
    if (!before || !after || before.id !== after.id) return;
    const { joined, left } = memberChanges(before.members, after.members);
    for (const member of joined) toast.info(`${member.displayName} joined the room`);
    for (const member of left) toast.info(`${member.displayName} left the room`);
  }, [fetchRoom, toast]);

  const handleEvent = useCallback(
    async (event: RoomEvent) => {
      for (const listener of listeners.current) listener(event);
      try {
        if (event.type === "MATCH_FOUND") {
          if (event.matchId) routeToMatch(event.matchId);
        } else if (event.type === "MEMBERS_CHANGED") {
          await announceMemberChanges();
        } else {
          await refreshRoom();
        }
      } catch {
        // The next event or resync catches up; a blip isn't worth a toast.
      }
    },
    [announceMemberChanges, refreshRoom, routeToMatch],
  );

  const resync = useCallback(async () => {
    await Promise.allSettled([refreshRoom(), checkPendingMatch()]);
  }, [refreshRoom, checkPendingMatch]);

  const roomId = room?.id;
  useEffect(() => {
    if (!roomId) return undefined;
    return subscribeToRoom({
      roomId,
      onEvent: (event) => void handleEvent(event),
      onStatusChange: setRealtimeStatus,
      onResync: () => void resync(),
    });
  }, [roomId, handleEvent, resync]);

  const wasOnMatchScreen = useRef(false);
  useEffect(() => {
    const matchId = MATCH_PATH.exec(pathname)?.[1];
    if (matchId) {
      routedMatchIds.current.add(matchId);
    } else if (wasOnMatchScreen.current) {
      void checkPendingMatch().catch(() => undefined);
    }
    wasOnMatchScreen.current = matchId !== undefined;
  }, [pathname, checkPendingMatch]);

  const subscribeEvents = useCallback((listener: RoomEventListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const value = useMemo(
    () =>
      me && room
        ? {
            me,
            room,
            realtimeStatus,
            deckVersion,
            setRoom,
            setMe,
            refreshRoom,
            goToMatch,
            subscribeEvents,
          }
        : null,
    [me, room, realtimeStatus, deckVersion, setRoom, refreshRoom, goToMatch, subscribeEvents],
  );

  if (!value) {
    if (loadFailed) {
      return <ErrorState message="We couldn't load your room." onRetry={() => void load()} />;
    }
    return <SkeletonPage />;
  }
  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}
