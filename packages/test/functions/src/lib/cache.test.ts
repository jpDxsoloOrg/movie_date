import { GetCommand, PutCommand } from "@aws-sdk/lib-dynamodb";
import { cached } from "@movie-date/functions/lib/cache";
import { getClient } from "@movie-date/functions/lib/db";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dynamo = mockClient(getClient());
const NOW_MS = 1_700_000_000_000;
const NOW_SECONDS = NOW_MS / 1000;

beforeEach(() => {
  dynamo.reset();
  dynamo.on(PutCommand).resolves({});
  vi.spyOn(Date, "now").mockReturnValue(NOW_MS);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("cached", () => {
  it("returns a fresh row without loading", async () => {
    dynamo.on(GetCommand).resolves({ Item: { value: "stored", expiresAt: NOW_SECONDS + 1 } });
    const load = vi.fn();
    expect(await cached("kind", "key", 60, load)).toBe("stored");
    expect(load).not.toHaveBeenCalled();
  });

  it("treats a stored null as a hit", async () => {
    dynamo.on(GetCommand).resolves({ Item: { value: null, expiresAt: NOW_SECONDS + 1 } });
    const load = vi.fn();
    expect(await cached("kind", "key", 60, load)).toBeNull();
    expect(load).not.toHaveBeenCalled();
  });

  it("ignores an expired row that DynamoDB hasn't removed yet", async () => {
    dynamo.on(GetCommand).resolves({ Item: { value: "stale", expiresAt: NOW_SECONDS } });
    expect(await cached("kind", "key", 60, async () => "fresh")).toBe("fresh");
  });

  it("stores a loaded value under the cache key with its TTL", async () => {
    dynamo.on(GetCommand).resolves({});
    await cached("kind", "key", 60, async () => "fresh");
    expect(dynamo.commandCalls(PutCommand)[0]?.args[0].input.Item).toEqual({
      pk: "CACHE#kind#key",
      sk: "CACHE",
      value: "fresh",
      expiresAt: NOW_SECONDS + 60,
    });
  });

  it("stores nothing when the load fails", async () => {
    dynamo.on(GetCommand).resolves({});
    const load = vi.fn().mockRejectedValue(new Error("upstream"));
    await expect(cached("kind", "key", 60, load)).rejects.toThrow("upstream");
    expect(dynamo.commandCalls(PutCommand)).toHaveLength(0);
  });

  it("survives the table being unavailable", async () => {
    dynamo.on(GetCommand).rejects(new Error("down"));
    dynamo.on(PutCommand).rejects(new Error("down"));
    expect(await cached("kind", "key", 60, async () => "fresh")).toBe("fresh");
  });
});
