import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { useLocation, useNavigate } from "react-router-dom";
import { clearFilterDraft } from "../components/filters/filterDraft";
import { MatchBanner } from "../components/MatchBanner";
import { ErrorState } from "../components/StateMessage";
import { SkeletonPage } from "../components/Skeleton";
import { useToast } from "../hooks/useToast";
import { useMode } from "../mode/ModeProvider";
import { isFiltersPath, matchIdOfPath, matchPath } from "../mode/modeRoutes";
import {
  api,
  type Match,
  type MediaType,
  type Member,
  type Profile,
  type Room,
  type RoomEvent,
} from "../services/api";
import { subscribeToRoom, type RealtimeStatus } from "../services/realtime";

export type RoomEventListener = (event: RoomEvent) => void;

export interface RoomContextValue {
  me: Profile;
  room: Room;
  realtimeStatus: RealtimeStatus;
  /** Changes whenever the current mode's deck is out of date. Use it as a dependency or a key. */
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

/** What the match route receives in router state when the app has the match in hand. */
export interface MatchRouteState {
  match?: Match;
  /** The person pressed View, and the button they pressed is gone. */
  focusHeadline?: boolean;
}

export const RoomContext = createContext<RoomContextValue | null>(null);

/** Home's place for the other-mode banner. Off Home, it sits at the screen's edge instead. */
export const MatchBannerSlotContext = createContext<(slot: HTMLElement | null) => void>(() => undefined);

/** A match found in the mode this person isn't in. */
interface OtherModeMatch {
  matchId: string;
  mediaType: MediaType;
  match?: Match;
  /** The round it belongs to. Undefined until the room has loaded, and then it's the room's. */
  round?: number;
}

function roundIn(room: Room, mediaType: MediaType): number {
  return mediaType === "TV" ? room.tvRound : room.round;
}

/** Once that mode's round moves on, the match is over for everyone. */
function isCurrent(banner: OtherModeMatch, room: Room): boolean {
  return (banner.round ?? roundIn(room, banner.mediaType)) >= roundIn(room, banner.mediaType);
}

/**
 * A threshold or member change leaves a deck valid; these don't. Each mode has its own
 * round and filters, so a reset in one can't restart a deck in the other.
 */
function deckKey(room: Room, mediaType: MediaType): string {
  return mediaType === "TV"
    ? JSON.stringify([room.id, room.tvRound, room.tvFilters])
    : JSON.stringify([room.id, room.round, room.filters]);
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
  const { mode } = useMode();
  // Read when an event lands, so changing mode doesn't redial the socket either.
  const modeRef = useRef(mode);
  modeRef.current = mode;

  const [me, setMe] = useState<Profile | null>(null);
  const [room, setRoomState] = useState<Room | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");
  const [deckVersions, setDeckVersions] = useState<Record<MediaType, number>>({ MOVIE: 0, TV: 0 });
  const [otherModeMatch, setOtherModeMatch] = useState<OtherModeMatch | null>(null);
  const [bannerSlot, setBannerSlot] = useState<HTMLElement | null>(null);

  const roomRef = useRef<Room | null>(null);
  const roomRequest = useRef(0);
  const loading = useRef(false);
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;
  const listeners = useRef(new Set<RoomEventListener>());
  // Each match routes a person once, so leaving the match screen by the drawer
  // doesn't bounce them back on the next focus while the round still has it. A
  // dismissed banner counts: they've seen it and said no.
  const routedMatchIds = useRef(new Set<string>());

  const applyRoom = useCallback((next: Room) => {
    const previous = roomRef.current;
    roomRef.current = next;
    setRoomState(next);
    if (previous) {
      const bump = (mediaType: MediaType): number =>
        deckKey(previous, mediaType) === deckKey(next, mediaType) ? 0 : 1;
      const movieBump = bump("MOVIE");
      const showBump = bump("TV");
      if (movieBump + showBump > 0) {
        setDeckVersions((versions) => ({ MOVIE: versions.MOVIE + movieBump, TV: versions.TV + showBump }));
      }
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

  const openMatch = useCallback((matchId: string, mediaType: MediaType, match?: Match, focusHeadline = false) => {
    routedMatchIds.current.add(matchId);
    setOtherModeMatch((shown) => (shown?.matchId === matchId ? null : shown));
    const state: MatchRouteState = { match, focusHeadline };
    navigateRef.current(matchPath(mediaType, matchId), { state });
  }, []);

  const routeToMatch = useCallback(
    (matchId: string, mediaType: MediaType, match?: Match) => {
      if (routedMatchIds.current.has(matchId)) return;
      // Nobody is pulled out of a swipe in the other mode.
      if (mediaType !== modeRef.current) {
        const room = roomRef.current;
        const round = match?.round ?? (room ? roundIn(room, mediaType) : undefined);
        setOtherModeMatch((shown) =>
          shown?.matchId === matchId && (shown.match || !match) ? shown : { matchId, mediaType, match, round },
        );
        return;
      }
      // Someone reading a match isn't pulled off it. Leaving the screen re-checks
      // pendingMatch, so this one isn't lost.
      if (matchIdOfPath(pathnameRef.current)) return;
      openMatch(matchId, mediaType, match);
    },
    [openMatch],
  );

  const goToMatch = useCallback(
    (match: Match) => routeToMatch(match.id, match.mediaType, match),
    [routeToMatch],
  );

  const checkPendingMatch = useCallback(async () => {
    // A show check that fails must not cost someone their room. The next resync retries it.
    const [movie, show] = await Promise.all([
      api.pendingMatch("MOVIE"),
      api.pendingMatch("TV").catch(() => null),
    ]);
    // A clear can land while the socket is down, and nothing else takes its banner away.
    setOtherModeMatch((shown) => {
      if (!shown) return shown;
      return (shown.mediaType === "TV" ? show : movie) ? shown : null;
    });
    for (const pending of [movie, show]) {
      if (pending) routeToMatch(pending.id, pending.mediaType, pending);
    }
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
          if (event.matchId) routeToMatch(event.matchId, event.mediaType ?? "MOVIE");
        } else if (event.type === "MATCH_CLEARED") {
          if (!event.matchId) return;
          const { matchId } = event;
          routedMatchIds.current.add(matchId);
          setOtherModeMatch((shown) => (shown?.matchId === matchId ? null : shown));
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

  // A draft only means anything between Filters and ActorSearch. Left anywhere else
  // (a match pulling someone out), it mustn't reappear on the next visit to Filters.
  useEffect(() => {
    if (!isFiltersPath(pathname)) clearFilterDraft();
  }, [pathname]);

  const wasOnMatchScreen = useRef(false);
  useEffect(() => {
    const matchId = matchIdOfPath(pathname);
    if (matchId) {
      routedMatchIds.current.add(matchId);
      setOtherModeMatch((shown) => (shown?.matchId === matchId ? null : shown));
    } else if (wasOnMatchScreen.current) {
      void checkPendingMatch().catch(() => undefined);
    }
    wasOnMatchScreen.current = matchId !== undefined;
  }, [pathname, checkPendingMatch]);

  // Arriving in a mode is when its waiting match can route, as opening the app does.
  const previousMode = useRef(mode);
  useEffect(() => {
    if (previousMode.current === mode) return;
    previousMode.current = mode;
    void checkPendingMatch().catch(() => undefined);
  }, [mode, checkPendingMatch]);

  const subscribeEvents = useCallback((listener: RoomEventListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const deckVersion = deckVersions[mode];
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

  const banner =
    otherModeMatch && isCurrent(otherModeMatch, value.room) ? (
      <MatchBanner
        mediaType={otherModeMatch.mediaType}
        atFoot={!bannerSlot && !isFiltersPath(pathname)}
        onView={() => openMatch(otherModeMatch.matchId, otherModeMatch.mediaType, otherModeMatch.match, true)}
        onDismiss={() => {
          routedMatchIds.current.add(otherModeMatch.matchId);
          setOtherModeMatch(null);
        }}
      />
    ) : null;

  return (
    <RoomContext.Provider value={value}>
      <MatchBannerSlotContext.Provider value={setBannerSlot}>{children}</MatchBannerSlotContext.Provider>
      {bannerSlot && banner ? createPortal(banner, bannerSlot) : banner}
    </RoomContext.Provider>
  );
}
