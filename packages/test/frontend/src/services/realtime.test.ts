import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getIdToken: vi.fn(), signOut: vi.fn() }));
vi.mock("@movie-date/frontend/services/auth", () => auth);

import { setAppConfig } from "@movie-date/frontend/services/config";
import { subscribeToRoom, type RealtimeStatus } from "@movie-date/frontend/services/realtime";

class FakeSocket {
  static OPEN = 1;
  static instances: FakeSocket[] = [];

  readyState = FakeSocket.OPEN;
  sent: { type: string; id?: string; payload?: { data: string; extensions: unknown } }[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((frame: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(
    readonly url: string,
    readonly protocols: string[],
  ) {
    FakeSocket.instances.push(this);
  }

  send(raw: string): void {
    this.sent.push(JSON.parse(raw) as FakeSocket["sent"][number]);
  }

  close(): void {
    this.closed = true;
  }

  receive(message: unknown): void {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  handshake(): void {
    this.onopen?.();
    this.receive({ type: "connection_ack", payload: { connectionTimeoutMs: 300_000 } });
    this.receive({ type: "start_ack", id: this.sent.at(-1)?.id });
  }
}

const flush = () => vi.advanceTimersByTimeAsync(0);
const latestSocket = (): FakeSocket => {
  const socket = FakeSocket.instances.at(-1);
  if (!socket) throw new Error("no socket");
  return socket;
};

function decodeHeader(url: string): Record<string, string> {
  const header = new URL(url).searchParams.get("header") ?? "";
  return JSON.parse(atob(header)) as Record<string, string>;
}

let stop: (() => void) | undefined;

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  FakeSocket.instances = [];
  vi.stubGlobal("WebSocket", FakeSocket);
  auth.getIdToken.mockResolvedValue("jwt-1");
  setAppConfig({
    graphqlUrl: "https://abc.appsync-api.us-east-1.amazonaws.com/graphql",
    realtimeUrl: "wss://abc.appsync-realtime-api.us-east-1.amazonaws.com/graphql",
    userPoolId: "pool",
    userPoolClientId: "client",
  });
});

afterEach(() => {
  stop?.();
  stop = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("handshake", () => {
  it("authenticates with Cognito against the API host, not the realtime host", async () => {
    stop = subscribeToRoom({ roomId: "room-1", onEvent: vi.fn() });
    await flush();

    const socket = latestSocket();
    expect(socket.protocols).toEqual(["graphql-ws"]);
    expect(decodeHeader(socket.url)).toEqual({
      host: "abc.appsync-api.us-east-1.amazonaws.com",
      Authorization: "jwt-1",
    });

    socket.onopen?.();
    expect(socket.sent[0]).toEqual({ type: "connection_init" });

    socket.receive({ type: "connection_ack", payload: { connectionTimeoutMs: 300_000 } });
    const start = socket.sent[1];
    expect(start?.type).toBe("start");
    expect(start?.payload?.extensions).toEqual({
      authorization: { host: "abc.appsync-api.us-east-1.amazonaws.com", Authorization: "jwt-1" },
    });
    const data = JSON.parse(start?.payload?.data ?? "{}") as { query: string; variables: unknown };
    expect(data.variables).toEqual({ roomId: "room-1" });
    for (const field of ["roomId", "type", "movieId", "matchId", "round", "actorId"]) {
      expect(data.query).toContain(field);
    }
  });

  it("delivers events and goes live", async () => {
    const onEvent = vi.fn();
    const statuses: RealtimeStatus[] = [];
    stop = subscribeToRoom({ roomId: "r", onEvent, onStatusChange: (status) => statuses.push(status) });
    await flush();
    latestSocket().handshake();

    const event = { roomId: "r", type: "ROOM_UPDATED" };
    latestSocket().receive({ type: "data", payload: { data: { onRoomEvent: event } } });

    expect(onEvent).toHaveBeenCalledWith(event);
    expect(statuses).toEqual(["connecting", "live"]);
  });
});

describe("reconnect", () => {
  it("redials with a fresh token after a drop, and asks for a resync", async () => {
    const onResync = vi.fn();
    stop = subscribeToRoom({ roomId: "r", onEvent: vi.fn(), onResync });
    await flush();
    latestSocket().handshake();
    expect(onResync).toHaveBeenCalledTimes(1);

    auth.getIdToken.mockResolvedValue("jwt-2");
    latestSocket().onclose?.();
    await vi.advanceTimersByTimeAsync(20_000);

    expect(FakeSocket.instances).toHaveLength(2);
    expect(decodeHeader(latestSocket().url).Authorization).toBe("jwt-2");
    latestSocket().handshake();
    expect(onResync).toHaveBeenCalledTimes(2);
  });

  it("backs off, doubling the ceiling on each failure", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1);
    stop = subscribeToRoom({ roomId: "r", onEvent: vi.fn() });
    await flush();

    latestSocket().onerror?.();
    await vi.advanceTimersByTimeAsync(499);
    expect(FakeSocket.instances).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.instances).toHaveLength(2);

    latestSocket().onerror?.();
    await vi.advanceTimersByTimeAsync(999);
    expect(FakeSocket.instances).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(FakeSocket.instances).toHaveLength(3);
    vi.restoreAllMocks();
  });

  it("treats keep-alive silence as a dead socket", async () => {
    stop = subscribeToRoom({ roomId: "r", onEvent: vi.fn() });
    await flush();
    latestSocket().handshake();
    const first = latestSocket();

    await vi.advanceTimersByTimeAsync(170_000);

    expect(first.closed).toBe(true);
    expect(FakeSocket.instances.length).toBeGreaterThan(1);
  });

  it("gives up on a handshake that never answers", async () => {
    stop = subscribeToRoom({ roomId: "r", onEvent: vi.fn() });
    await flush();
    const first = latestSocket();
    await vi.advanceTimersByTimeAsync(170_000);
    expect(first.closed).toBe(true);
  });

  it("keeps retrying while the session can't be read", async () => {
    auth.getIdToken.mockRejectedValueOnce(new Error("offline"));
    stop = subscribeToRoom({ roomId: "r", onEvent: vi.fn() });
    await flush();
    expect(FakeSocket.instances).toHaveLength(0);

    await vi.advanceTimersByTimeAsync(1_000);
    expect(FakeSocket.instances).toHaveLength(1);
  });

  it("redials at once when the network returns", async () => {
    stop = subscribeToRoom({ roomId: "r", onEvent: vi.fn() });
    await flush();
    latestSocket().handshake();
    const stale = latestSocket();

    window.dispatchEvent(new Event("online"));
    await flush();

    expect(stale.closed).toBe(true);
    expect(FakeSocket.instances).toHaveLength(2);
  });
});

describe("revoked by the backend", () => {
  it("resyncs and redials, so another device finds the room its user moved to", async () => {
    const onResync = vi.fn();
    stop = subscribeToRoom({ roomId: "r", onEvent: vi.fn(), onResync });
    await flush();
    latestSocket().handshake();
    onResync.mockClear();
    const revoked = latestSocket();

    revoked.receive({ type: "complete", id: "x" });

    expect(onResync).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(20_000);
    expect(latestSocket()).not.toBe(revoked);
  });
});

describe("tab focus", () => {
  it("resyncs on focus, once for the focus and visibility pair", async () => {
    const onResync = vi.fn();
    stop = subscribeToRoom({ roomId: "r", onEvent: vi.fn(), onResync });
    await flush();
    latestSocket().handshake();
    onResync.mockClear();
    await vi.advanceTimersByTimeAsync(5_000);

    window.dispatchEvent(new Event("focus"));
    document.dispatchEvent(new Event("visibilitychange"));

    expect(onResync).toHaveBeenCalledOnce();
  });

  it("resyncs even when the socket is down", async () => {
    const onResync = vi.fn();
    auth.getIdToken.mockRejectedValue(new Error("offline"));
    stop = subscribeToRoom({ roomId: "r", onEvent: vi.fn(), onResync });
    await flush();

    window.dispatchEvent(new Event("focus"));
    expect(onResync).toHaveBeenCalledOnce();
  });
});

describe("teardown", () => {
  it("stops everything", async () => {
    const onResync = vi.fn();
    const teardown = subscribeToRoom({ roomId: "r", onEvent: vi.fn(), onResync });
    await flush();
    latestSocket().handshake();
    onResync.mockClear();
    const socket = latestSocket();

    teardown();
    await vi.advanceTimersByTimeAsync(200_000);
    window.dispatchEvent(new Event("focus"));

    expect(socket.sent.at(-1)).toEqual({ type: "connection_terminate" });
    expect(socket.closed).toBe(true);
    expect(FakeSocket.instances).toHaveLength(1);
    expect(onResync).not.toHaveBeenCalled();
  });

  it("doesn't open a socket if torn down while fetching the token", async () => {
    const teardown = subscribeToRoom({ roomId: "r", onEvent: vi.fn() });
    teardown();
    await flush();
    expect(FakeSocket.instances).toHaveLength(0);
  });
});
