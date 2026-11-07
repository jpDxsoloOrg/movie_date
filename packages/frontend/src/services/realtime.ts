/**
 * AppSync's realtime protocol borrows the `graphql-ws` subprotocol name but not
 * its message shapes: the subscription travels as a JSON-encoded string inside
 * `payload.data`, auth is repeated in `extensions.authorization`, and the auth
 * `host` is the appsync-api host even though we dial the realtime one. Standard
 * clients can't talk to it, hence this.
 *
 * Phones sleep and AppSync recycles sockets, so a drop is routine. Each connection
 * takes a fresh token, because the socket dies when the token it opened with expires.
 */
import type { OnRoomEventSubscription } from "../gql/graphql";
import { OnRoomEventDocument, type RoomEvent } from "./api";
import { getIdToken } from "./auth";
import { appConfig } from "./config";

export type RealtimeStatus = "connecting" | "live" | "offline";

export interface RoomSubscriptionOptions {
  roomId: string;
  onEvent: (event: RoomEvent) => void;
  onStatusChange?: (status: RealtimeStatus) => void;
  /**
   * Called when events may have been missed: each time the subscription goes
   * live (the first time too, since it closes the gap after the initial fetch)
   * and when the tab regains focus. Re-read pendingMatch and the room here.
   */
  onResync?: () => void;
}

const FIRST_RETRY_MS = 500;
const MAX_RETRY_MS = 15_000;
/** AppSync sends `ka` about once a minute; miss two and the socket is dead. */
const KEEP_ALIVE_GRACE_MS = 150_000;
/** Focus and visibilitychange fire together when a tab comes back. */
const RESYNC_THROTTLE_MS = 1_000;

interface ServerMessage {
  type: string;
  id?: string;
  payload?: { connectionTimeoutMs?: number; data?: OnRoomEventSubscription };
}

function encode(value: unknown): string {
  return encodeURIComponent(btoa(JSON.stringify(value)));
}

/** Full jitter, so a whole room doesn't redial in step. */
function backoff(attempt: number): number {
  return Math.random() * Math.min(MAX_RETRY_MS, FIRST_RETRY_MS * 2 ** attempt);
}

/** Watches one room. The returned function stops it, including all reconnection. */
export function subscribeToRoom(options: RoomSubscriptionOptions): () => void {
  const { roomId, onEvent, onStatusChange, onResync } = options;
  const { realtimeUrl, graphqlUrl } = appConfig();
  const host = new URL(graphqlUrl).host;

  let socket: WebSocket | undefined;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let keepAliveTimer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let closed = false;
  let status: RealtimeStatus | undefined;
  let lastResyncAt = Number.NEGATIVE_INFINITY;

  const setStatus = (next: RealtimeStatus): void => {
    if (status === next) return;
    status = next;
    onStatusChange?.(next);
  };

  const detach = (ws: WebSocket): void => {
    ws.onopen = null;
    ws.onmessage = null;
    ws.onclose = null;
    ws.onerror = null;
    try {
      ws.close();
    } catch {
      // Already closing; it is being replaced regardless.
    }
  };

  /**
   * Doesn't wait for `onclose`: a dropped network can leave a socket in CLOSING
   * indefinitely, and a client waiting on that believes it is live and hears nothing.
   */
  const dropAndRetry = (ws: WebSocket | undefined): void => {
    if (!ws || ws !== socket) return;
    socket = undefined;
    detach(ws);
    scheduleRetry();
  };

  const armKeepAlive = (timeoutMs: number): void => {
    if (keepAliveTimer !== undefined) clearTimeout(keepAliveTimer);
    keepAliveTimer = setTimeout(() => dropAndRetry(socket), timeoutMs);
  };

  function scheduleRetry(): void {
    if (closed || retryTimer !== undefined) return;
    setStatus("offline");
    const delay = backoff(attempt);
    attempt += 1;
    retryTimer = setTimeout(() => {
      retryTimer = undefined;
      void connect();
    }, delay);
  }

  async function connect(): Promise<void> {
    if (closed) return;
    setStatus("connecting");

    let token: string | null;
    try {
      token = await getIdToken();
    } catch {
      token = null;
    }
    if (closed || socket) return;
    if (!token) {
      scheduleRetry();
      return;
    }

    const authorization = { host, Authorization: token };
    const subscriptionId = crypto.randomUUID();
    const ws = new WebSocket(
      `${realtimeUrl}?header=${encode(authorization)}&payload=${encode({})}`,
      ["graphql-ws"],
    );
    socket = ws;
    // Also guards the handshake, which can hang with no error at all.
    armKeepAlive(KEEP_ALIVE_GRACE_MS);

    ws.onopen = () => ws.send(JSON.stringify({ type: "connection_init" }));

    ws.onmessage = (frame: MessageEvent<string>) => {
      if (closed || socket !== ws) return;
      let message: ServerMessage;
      try {
        message = JSON.parse(frame.data) as ServerMessage;
      } catch {
        return;
      }

      switch (message.type) {
        case "connection_ack":
          armKeepAlive(
            Math.min(message.payload?.connectionTimeoutMs ?? KEEP_ALIVE_GRACE_MS, KEEP_ALIVE_GRACE_MS),
          );
          ws.send(
            JSON.stringify({
              id: subscriptionId,
              type: "start",
              payload: {
                data: JSON.stringify({
                  query: OnRoomEventDocument.toString(),
                  variables: { roomId },
                }),
                extensions: { authorization },
              },
            }),
          );
          break;
        case "start_ack":
          attempt = 0;
          setStatus("live");
          lastResyncAt = Date.now();
          onResync?.();
          break;
        case "ka":
          armKeepAlive(KEEP_ALIVE_GRACE_MS);
          break;
        case "data": {
          const event = message.payload?.data?.onRoomEvent;
          if (event) onEvent(event);
          break;
        }
        case "error":
        case "connection_error":
          // Covers an expired token and a just-left room; the backoff keeps a
          // refusal that won't clear cheap.
          dropAndRetry(ws);
          break;
        default:
          break;
      }
    };

    ws.onclose = () => dropAndRetry(ws);
    ws.onerror = () => dropAndRetry(ws);
  }

  // The browser knows the network is back before any timer does. A socket that
  // predates the outage may be half open, reporting nothing and delivering nothing.
  const onOnline = (): void => {
    if (closed) return;
    const stale = socket;
    socket = undefined;
    if (stale) detach(stale);
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    retryTimer = undefined;
    attempt = 0;
    void connect();
  };

  const resyncOnReturn = (): void => {
    if (closed || document.visibilityState === "hidden") return;
    const now = Date.now();
    if (now - lastResyncAt < RESYNC_THROTTLE_MS) return;
    lastResyncAt = now;
    onResync?.();
  };

  window.addEventListener("online", onOnline);
  window.addEventListener("focus", resyncOnReturn);
  document.addEventListener("visibilitychange", resyncOnReturn);

  void connect();

  return () => {
    closed = true;
    window.removeEventListener("online", onOnline);
    window.removeEventListener("focus", resyncOnReturn);
    document.removeEventListener("visibilitychange", resyncOnReturn);
    if (retryTimer !== undefined) clearTimeout(retryTimer);
    if (keepAliveTimer !== undefined) clearTimeout(keepAliveTimer);
    const open = socket;
    socket = undefined;
    if (open?.readyState === WebSocket.OPEN) {
      open.send(JSON.stringify({ type: "connection_terminate" }));
    }
    if (open) detach(open);
  };
}
