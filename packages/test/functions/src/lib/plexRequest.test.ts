import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import {
  createRequest,
  findUser,
  libraryMovies,
  libraryShows,
  movieStatus,
  PlexRequestUnavailableError,
} from "@movie-date/functions/lib/plexRequest";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const lambda = mockClient(LambdaClient);
const DRAFT = {
  userId: "u1",
  email: "ana@example.com",
  tmdbId: 1,
  title: "A",
  year: "2000",
  overview: "",
  posterPath: "/a.jpg",
};

function answersRaw(envelope: unknown) {
  lambda.on(InvokeCommand).resolves({
    StatusCode: 200,
    Payload: new TextEncoder().encode(JSON.stringify(envelope)) as never,
  });
}

function answers(data: unknown) {
  answersRaw({ ok: true, data });
}

beforeEach(() => {
  lambda.reset();
  process.env.PLEX_INTEGRATION_FUNCTION = "plex-integration";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(() => {
  lambda.restore();
});

describe("invoking the integration", () => {
  it("calls the configured function with the op as its payload", async () => {
    answers(null);
    await findUser("ana@example.com");
    const [call] = lambda.commandCalls(InvokeCommand);
    expect(call?.args[0].input.FunctionName).toBe("plex-integration");
    expect(JSON.parse(String(call?.args[0].input.Payload))).toEqual({
      op: "findUser",
      email: "ana@example.com",
    });
  });

  it("is unavailable when no function is configured", async () => {
    delete process.env.PLEX_INTEGRATION_FUNCTION;
    await expect(findUser("ana@example.com")).rejects.toBeInstanceOf(PlexRequestUnavailableError);
    expect(lambda.commandCalls(InvokeCommand)).toHaveLength(0);
  });

  it("treats a crash in the function as unavailable", async () => {
    lambda.on(InvokeCommand).resolves({
      FunctionError: "Unhandled",
      Payload: new TextEncoder().encode('{"errorMessage":"boom"}') as never,
    });
    await expect(libraryMovies()).rejects.toBeInstanceOf(PlexRequestUnavailableError);
  });

  it("treats a refused call as unavailable", async () => {
    lambda.on(InvokeCommand).rejects(Object.assign(new Error("Denied"), { name: "AccessDeniedException" }));
    await expect(movieStatus(1, "plex-1")).rejects.toBeInstanceOf(PlexRequestUnavailableError);
  });

  it("treats a reported error as unavailable", async () => {
    answersRaw({ ok: false, error: "INTERNAL_ERROR", message: "Could not complete" });
    await expect(movieStatus(1, "plex-1")).rejects.toBeInstanceOf(PlexRequestUnavailableError);
  });

  it("won't take an answer outside the envelope", async () => {
    answersRaw([{ tmdbId: 1, hasFile: true }]);
    await expect(libraryMovies()).rejects.toBeInstanceOf(PlexRequestUnavailableError);
  });

  it("treats a garbled answer as unavailable", async () => {
    lambda.on(InvokeCommand).resolves({ Payload: new TextEncoder().encode("not json") as never });
    await expect(findUser("a@b.c")).rejects.toBeInstanceOf(PlexRequestUnavailableError);
  });

  it("logs the op and nothing from the payload", async () => {
    lambda.on(InvokeCommand).rejects(new Error("Failed for ana@example.com"));
    await findUser("ana@example.com").catch(() => undefined);
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain("ana@example.com");
  });
});

describe("findUser", () => {
  it("returns the account", async () => {
    answers({ userId: "u1", email: "Ana@Example.com" });
    expect(await findUser("ana@example.com")).toEqual({ userId: "u1", email: "Ana@Example.com" });
  });

  it.each([[null], [{}], [{ userId: "u1" }]])("reads %j as no account", async (body) => {
    answers(body);
    expect(await findUser("ana@example.com")).toBeNull();
  });
});

describe("movieStatus", () => {
  it("reads library state and any active request", async () => {
    answers({ inLibrary: true, hasFile: false, activeRequest: { status: "approved" } });
    expect(await movieStatus(1, "plex-1")).toEqual({
      inLibrary: true,
      hasFile: false,
      hasActiveRequest: true,
    });
  });

  it("won't read an unexpected answer as not in the library", async () => {
    answers({ surprise: true });
    await expect(movieStatus(1, "plex-1")).rejects.toBeInstanceOf(PlexRequestUnavailableError);
  });
});

describe("createRequest", () => {
  it("sends the draft whole", async () => {
    answers({ outcome: "created", requestId: "r1", status: "approved", autoApproved: true });
    await createRequest(DRAFT);
    const payload = lambda.commandCalls(InvokeCommand)[0]?.args[0].input.Payload;
    expect(JSON.parse(String(payload))).toEqual({ op: "createRequest", ...DRAFT });
  });

  it("accepts a duplicate", async () => {
    answers({ outcome: "duplicate" });
    await expect(createRequest(DRAFT)).resolves.toBeUndefined();
  });

  it("won't take an unknown outcome as success", async () => {
    answers({ outcome: "rejected" });
    await expect(createRequest(DRAFT)).rejects.toBeInstanceOf(PlexRequestUnavailableError);
  });
});

describe("libraryShows", () => {
  it("reads TVDB ids and ignores anything else", async () => {
    answers([
      { tvdbId: 121361, hasFile: false },
      { tvdbId: 7, hasFile: true },
      { tvdbId: 0, hasFile: true },
      { tvdbId: "8", hasFile: true },
    ]);
    expect(await libraryShows()).toEqual([
      { tvdbId: 121361, hasFile: false },
      { tvdbId: 7, hasFile: true },
    ]);
  });

  it("reads an integration that doesn't have the op as no shows", async () => {
    answersRaw({ ok: false, error: "INVALID_INPUT", message: "op must be findUser or libraryMovies" });
    expect(await libraryShows()).toEqual([]);
  });

  it("treats any other failure as one, so an outage can't look like an empty library", async () => {
    answersRaw({ ok: false, error: "INTERNAL_ERROR", message: "boom" });
    await expect(libraryShows()).rejects.toBeInstanceOf(PlexRequestUnavailableError);
    answers({ surprise: true });
    await expect(libraryShows()).rejects.toBeInstanceOf(PlexRequestUnavailableError);
  });
});
