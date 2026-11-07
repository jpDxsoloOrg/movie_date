import { handler } from "@movie-date/functions/resolver";
import type { AppSyncResolverEvent } from "aws-lambda";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const me = vi.hoisted(() => vi.fn());
const publishRoomEvent = vi.hoisted(() => vi.fn());

vi.mock("@movie-date/functions/src/handlers/me.ts", () => ({ me }));
vi.mock("@movie-date/functions/src/handlers/publishRoomEvent.ts", () => ({ publishRoomEvent }));

function eventFor(fieldName: string, identity: unknown, args: unknown = {}) {
  return { info: { fieldName }, identity, arguments: args } as AppSyncResolverEvent<unknown>;
}

const user = { sub: "user-1", claims: { email: "a@example.com" } };
const backend = { userArn: "arn:aws:sts::1:assumed-role/x" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("resolver", () => {
  it("passes arguments and the caller to the field's handler", async () => {
    me.mockResolvedValue({ id: "user-1" });
    await expect(handler(eventFor("me", user))).resolves.toEqual({ id: "user-1" });
    expect(me).toHaveBeenCalledWith({}, { userId: "user-1", email: "a@example.com" });
  });

  it("refuses a user field without a Cognito identity", async () => {
    await expect(handler(eventFor("me", backend))).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(me).not.toHaveBeenCalled();
  });

  it("lets only IAM publish room events", async () => {
    await expect(handler(eventFor("publishRoomEvent", user))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(publishRoomEvent).not.toHaveBeenCalled();

    publishRoomEvent.mockResolvedValue({});
    await handler(eventFor("publishRoomEvent", backend));
    expect(publishRoomEvent).toHaveBeenCalledOnce();
  });

  it("does not leak unexpected errors", async () => {
    me.mockRejectedValue(new Error("internal table name"));
    await expect(handler(eventFor("me", user))).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("fails on an unknown field", async () => {
    await expect(handler(eventFor("nope", user))).rejects.toMatchObject({ code: "INTERNAL" });
  });

  it("has a handler for every root field in the schema", async () => {
    const schema = readFileSync(new URL("../../../../graphql/schema.graphql", import.meta.url), "utf8");
    const rootBlocks = [...schema.matchAll(/^type (?:Query|Mutation|Subscription) \{([\s\S]*?)^\}/gm)];
    const fields = rootBlocks.flatMap((block) =>
      [...(block[1] ?? "").matchAll(/^ {2}(\w+)[(:]/gm)].map((field) => field[1] ?? ""),
    );
    expect(fields).toHaveLength(23);

    const source = readFileSync(
      new URL("../../../functions/src/resolver.ts", import.meta.url),
      "utf8",
    );
    for (const field of fields) {
      expect(source).toContain(`from "./handlers/${field}.js"`);
    }
  });
});
