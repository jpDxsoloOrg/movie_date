import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ getIdToken: vi.fn(), signOut: vi.fn() }));
vi.mock("@movie-date/frontend/services/auth", () => auth);

import { api, ApiError, errorMessage } from "@movie-date/frontend/services/api";
import { setAppConfig } from "@movie-date/frontend/services/config";

const GRAPHQL_URL = "https://x.appsync-api.us-east-1.amazonaws.com/graphql";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const fetchMock = vi.fn<typeof fetch>();

function sentBody(call = 0): { query: string; variables: Record<string, unknown> } {
  return JSON.parse(String(fetchMock.mock.calls[call]?.[1]?.body)) as {
    query: string;
    variables: Record<string, unknown>;
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  auth.getIdToken.mockResolvedValue("token-1");
  setAppConfig({
    graphqlUrl: GRAPHQL_URL,
    realtimeUrl: "wss://r",
    userPoolId: "pool",
    userPoolClientId: "client",
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("execute", () => {
  it("sends the ID token and the variables", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { swipe: { movieId: 7, direction: "LIKE", match: null } } }),
    );

    const result = await api.swipe(7, "LIKE");

    expect(result.movieId).toBe(7);
    expect(fetchMock.mock.calls[0]?.[0]).toBe(GRAPHQL_URL);
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({ Authorization: "token-1" });
    expect(sentBody().variables).toEqual({ movieId: 7, direction: "LIKE" });
  });

  it("includes fragments in the operation text", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { myRoom: {} } }));
    await api.myRoom();
    expect(sentBody().query).toContain("fragment RoomFields on Room");
    expect(sentBody().query).toContain("fragment MemberFields on Member");
  });

  it("maps the backend's error codes and keeps its message", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: null, errors: [{ errorType: "VALIDATION", message: "Invalid room code" }] }),
    );

    const failure = await api.joinRoom("NOPE").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ code: "VALIDATION", message: "Invalid room code" });
    expect(errorMessage(failure)).toBe("Invalid room code");
  });

  it("marks an unknown errorType UNKNOWN", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ errors: [{ errorType: "INTERNAL", message: "Oops" }] }));
    await expect(api.me()).rejects.toMatchObject({ code: "UNKNOWN", errorType: "INTERNAL" });
  });

  it("refuses to send without a session", async () => {
    auth.getIdToken.mockResolvedValue(null);
    await expect(api.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats a fetch failure and a 5xx as NETWORK", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    await expect(api.me()).rejects.toMatchObject({ code: "NETWORK", isTransient: true });

    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 502 }));
    await expect(api.me()).rejects.toMatchObject({ code: "NETWORK" });
  });

  it("retries a 401 once with a refreshed token", async () => {
    auth.getIdToken.mockResolvedValueOnce("stale").mockResolvedValueOnce("fresh");
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ errors: [{ errorType: "UnauthorizedException" }] }, 401))
      .mockResolvedValueOnce(jsonResponse({ data: { pendingMatch: null } }));

    await expect(api.pendingMatch()).resolves.toBeNull();

    expect(auth.getIdToken).toHaveBeenLastCalledWith({ forceRefresh: true });
    expect(fetchMock.mock.calls[1]?.[1]?.headers).toMatchObject({ Authorization: "fresh" });
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("signs out when the refreshed token is refused too", async () => {
    fetchMock.mockImplementation(async () => jsonResponse({ errors: [] }, 401));
    await expect(api.me()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(auth.signOut).toHaveBeenCalledOnce();
  });
});

describe("avatars", () => {
  it("parses AWSJSON fields, including a double-encoded value", async () => {
    const fields = { key: "avatars/u/1", Policy: "abc" };
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: { createAvatarUpload: { url: "https://s3", key: "k", fields: JSON.stringify(fields) } },
      }),
    );
    await expect(api.createAvatarUpload("image/jpeg")).resolves.toMatchObject({ fields });

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: {
          createAvatarUpload: { url: "https://s3", key: "k", fields: JSON.stringify(JSON.stringify(fields)) },
        },
      }),
    );
    await expect(api.createAvatarUpload("image/jpeg")).resolves.toMatchObject({ fields });
  });

  it("posts the file as the last form field and returns the key", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            createAvatarUpload: {
              url: "https://s3.example/bucket",
              key: "avatars/u/1",
              fields: JSON.stringify({ key: "avatars/u/1", "Content-Type": "image/jpeg" }),
            },
          },
        }),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }));

    const key = await api.uploadAvatar(new Blob(["x"], { type: "image/jpeg" }), "image/jpeg");

    expect(key).toBe("avatars/u/1");
    const form = fetchMock.mock.calls[1]?.[1]?.body as FormData;
    expect([...form.keys()]).toEqual(["key", "Content-Type", "file"]);
  });

  it("fails when S3 refuses the upload", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ data: { createAvatarUpload: { url: "https://s3", key: "k", fields: "{}" } } }),
      )
      .mockResolvedValueOnce(new Response("EntityTooLarge", { status: 400 }));

    await expect(api.uploadAvatar(new Blob(["x"]), "image/png")).rejects.toBeInstanceOf(ApiError);
  });
});

describe("findMatch", () => {
  const match = (id: string) => ({ id, roomId: "r", round: 1, matchedAt: "t", movie: { id: 1 } });

  it("answers from pendingMatch when it can", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { pendingMatch: match("m1") } }));
    await expect(api.findMatch("m1")).resolves.toMatchObject({ id: "m1" });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("walks the match history", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { pendingMatch: null } }))
      .mockResolvedValueOnce(jsonResponse({ data: { matches: { matches: [match("a")], nextToken: "n" } } }))
      .mockResolvedValueOnce(jsonResponse({ data: { matches: { matches: [match("m9")], nextToken: null } } }));

    await expect(api.findMatch("m9")).resolves.toMatchObject({ id: "m9" });
    expect(sentBody(2).variables).toMatchObject({ nextToken: "n" });
  });

  it("is null when the match isn't in this room", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ data: { pendingMatch: null } }))
      .mockResolvedValueOnce(jsonResponse({ data: { matches: { matches: [], nextToken: null } } }));
    await expect(api.findMatch("gone")).resolves.toBeNull();
  });
});

describe("errorMessage", () => {
  it("falls back for things that aren't errors", () => {
    expect(errorMessage("nope")).toBe("Something went wrong. Please try again.");
  });
});
