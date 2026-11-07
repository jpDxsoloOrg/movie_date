import {
  publishRoomEvent,
  PUBLISH_MUTATION,
  revokeRoomSubscriptions,
  REVOKE_MUTATION,
} from "@movie-date/functions/lib/events";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const URL_UNDER_TEST = "https://abc.appsync-api.us-east-1.amazonaws.com/graphql";
const event = { roomId: "room-1", type: "MATCH_FOUND", movieId: 7, matchId: "m", round: 2, actorId: "a" } as const;

const fetchStub = vi.fn();

function respondWith(body: unknown, status = 200) {
  fetchStub.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

beforeEach(() => {
  fetchStub.mockReset();
  vi.stubGlobal("fetch", fetchStub);
  vi.stubEnv("GRAPHQL_URL", URL_UNDER_TEST);
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("revokeRoomSubscriptions", () => {
  it("sends the signed mutation with the room and user", async () => {
    respondWith({ data: { revokeRoomSubscriptions: true } });
    await revokeRoomSubscriptions("room-1", "sub-1");
    const [, init] = fetchStub.mock.calls[0] as [URL, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({
      query: REVOKE_MUTATION,
      variables: { roomId: "room-1", userId: "sub-1" },
    });
    expect(new Headers(init.headers).get("authorization")).toContain("AWS4-HMAC-SHA256");
  });

  it("logs a failure rather than failing a move that has already happened", async () => {
    respondWith({ errors: [{ message: "nope" }] });
    await expect(revokeRoomSubscriptions("room-1", "sub-1")).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});

describe("publishRoomEvent", () => {
  it("sends a SigV4-signed mutation carrying the event", async () => {
    respondWith({ data: {} });
    await publishRoomEvent(event);

    const [target, request] = fetchStub.mock.calls[0] as [URL, RequestInit];
    expect(String(target)).toBe(URL_UNDER_TEST);
    expect(request.method).toBe("POST");
    const headers = request.headers as Record<string, string>;
    expect(headers.authorization).toMatch(/^AWS4-HMAC-SHA256 Credential=test-key\/\d+\/us-east-1\/appsync\/aws4_request/);
    expect(headers.authorization).toContain("host");
    expect(JSON.parse(String(request.body))).toEqual({
      query: PUBLISH_MUTATION,
      variables: { input: event },
    });
  });

  it("selects every RoomEvent field, since subscribers get only those", () => {
    const schema = readFileSync(new URL("../../../../../graphql/schema.graphql", import.meta.url), "utf8");
    const block = /type RoomEvent [^{]*\{([\s\S]*?)\}/.exec(schema)?.[1] ?? "";
    const fields = [...block.matchAll(/^ {2}(\w+):/gm)].map((field) => field[1] ?? "");
    expect(fields).toHaveLength(7);
    for (const field of fields) expect(PUBLISH_MUTATION).toMatch(new RegExp(`^\\s+${field}$`, "m"));
  });

  it.each([
    ["the network fails", () => fetchStub.mockRejectedValue(new Error("reset"))],
    ["AppSync returns an error status", () => respondWith({}, 500)],
    ["AppSync rejects the mutation", () => respondWith({ errors: [{ message: "Unauthorized" }] })],
  ])("logs and carries on when %s", async (_label, arrange) => {
    arrange();
    await expect(publishRoomEvent(event)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalledOnce();
  });

  it("logs and carries on when the URL isn't configured", async () => {
    vi.stubEnv("GRAPHQL_URL", "");
    await expect(publishRoomEvent(event)).resolves.toBeUndefined();
    expect(fetchStub).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledOnce();
  });
});
