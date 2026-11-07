import { createAvatarUpload } from "@movie-date/functions/handlers/createAvatarUpload";
import { me } from "@movie-date/functions/handlers/me";
import { myRoom } from "@movie-date/functions/handlers/myRoom";
import { updateProfile } from "@movie-date/functions/handlers/updateProfile";
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { mockClient } from "aws-sdk-client-mock";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { roomOf, user } from "../support/roomFixture";

const AVATAR_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const OTHER_AVATAR_ID = "7c9e6679-7425-40de-944b-e07fc1f90ae7";

const JPEG_HEADER = [0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0];
const HTML_HEADER = [...Buffer.from("<html><body>")];

let table: FakeDynamo;
const s3 = mockClient(S3Client);

function uploaded(bytes: number[]): void {
  s3.on(GetObjectCommand).resolves({
    Body: { transformToByteArray: async () => Uint8Array.from(bytes) },
  } as never);
}

const deletedKeys = (): (string | undefined)[] =>
  s3.commandCalls(DeleteObjectCommand).map((call) => call.args[0].input.Key);

beforeEach(() => {
  table = new FakeDynamo();
  s3.reset();
  uploaded(JPEG_HEADER);
  vi.stubEnv("AVATARS_BUCKET", "avatars-bucket");
  vi.stubEnv("AWS_REGION", "us-east-1");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "test-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "test-secret");
});

afterEach(() => {
  table.restore();
  vi.unstubAllEnvs();
});

function roomsOwnedBy(name: string) {
  return table
    .findByPkPrefix("ROOM#")
    .filter((row) => row.sk === `MEMBER#sub-${name}`);
}

describe("me", () => {
  it("creates the profile and a first room on first call", async () => {
    await expect(me({}, user("ann"))).resolves.toEqual({
      id: "sub-ann",
      email: "ann@example.com",
      displayName: "ann",
      avatarUrl: null,
      plexLinked: false,
    });
    const profile = table.row("USER#sub-ann", "PROFILE");
    const meta = table.row(`ROOM#${String(profile?.roomId)}`, "META");
    expect(meta).toMatchObject({
      matchThreshold: 2,
      requireMajority: false,
      round: 1,
      filters: { genreIds: [], cast: [], services: [] },
    });
    expect(meta?.code).toMatch(/^[A-Z2-9]{6}$/);
    expect(table.row(`CODE#${String(meta?.code)}`, "ROOM")?.roomId).toBe(profile?.roomId);
  });

  it("returns the same profile afterwards", async () => {
    await me({}, user("ann"));
    const before = table.row("USER#sub-ann", "PROFILE");
    await me({}, user("ann"));
    expect(table.row("USER#sub-ann", "PROFILE")).toEqual(before);
    expect(roomsOwnedBy("ann")).toHaveLength(1);
  });

  it("creates one room however many first calls race", async () => {
    const results = await Promise.all([
      me({}, user("ann")),
      myRoom({}, user("ann")),
      me({}, user("ann")),
      myRoom({}, user("ann")),
      me({}, user("ann")),
    ]);
    expect(results).toHaveLength(5);
    expect(roomsOwnedBy("ann")).toHaveLength(1);
    expect(table.findByPkPrefix("CODE#")).toHaveLength(1);
    expect(table.findByPkPrefix("ROOM#").filter((row) => row.sk === "META")).toHaveLength(1);
  });

  it("draws a new code when one is taken", async () => {
    const taken = await myRoom({}, user("ann"));
    const random = vi.spyOn(globalThis.crypto, "getRandomValues");
    const codeBytes = [...taken.code].map((character) =>
      "ABCDEFGHJKMNPQRSTUVWXYZ23456789".indexOf(character),
    );
    random.mockImplementationOnce((buffer) => {
      (buffer as Uint8Array).set([...codeBytes, ...codeBytes]);
      return buffer;
    });

    const room = await myRoom({}, user("bob"));
    random.mockRestore();

    expect(room.code).not.toBe(taken.code);
    expect(table.row(`CODE#${taken.code}`, "ROOM")?.roomId).toBe(taken.id);
    expect(table.findByPkPrefix("ROOM#").filter((row) => row.sk === "META")).toHaveLength(2);
  });

  it("still creates a usable profile when the token carries no email", async () => {
    await expect(me({}, { userId: "sub-x" })).resolves.toMatchObject({
      email: "",
      displayName: "Movie Fan",
    });
  });
});

describe("myRoom", () => {
  it("lists members oldest first without their emails", async () => {
    const room = await roomOf("ann", "bob");
    expect(room.members).toEqual([
      { userId: "sub-ann", displayName: "ann", avatarUrl: null, isMe: true },
      { userId: "sub-bob", displayName: "bob", avatarUrl: null, isMe: false },
    ]);
    expect(JSON.stringify(room)).not.toContain("@example.com");
  });
});

describe("updateProfile", () => {
  it("changes the display name, trimmed, and leaves the rest", async () => {
    await me({}, user("ann"));
    await expect(updateProfile({ displayName: "  Annie " }, user("ann"))).resolves.toMatchObject({
      displayName: "Annie",
      email: "ann@example.com",
    });
  });

  it("promotes an upload under the caller's prefix and serves it from the bucket", async () => {
    const avatarKey = `pending/sub-ann/${AVATAR_ID}`;
    const profile = await updateProfile({ avatarKey }, user("ann"));
    const served = `avatars/sub-ann/${AVATAR_ID}`;
    expect(profile.avatarUrl).toBe(`https://avatars-bucket.s3.amazonaws.com/${served}`);
    expect(s3.commandCalls(CopyObjectCommand)[0]?.args[0].input).toMatchObject({
      Bucket: "avatars-bucket",
      Key: served,
      CopySource: `avatars-bucket/${avatarKey}`,
    });
    expect(deletedKeys()).toEqual([avatarKey]);
  });

  it("deletes the photo it replaces", async () => {
    await updateProfile({ avatarKey: `pending/sub-ann/${AVATAR_ID}` }, user("ann"));
    s3.resetHistory();
    await updateProfile({ avatarKey: `pending/sub-ann/${OTHER_AVATAR_ID}` }, user("ann"));
    expect(deletedKeys()).toEqual([`pending/sub-ann/${OTHER_AVATAR_ID}`, `avatars/sub-ann/${AVATAR_ID}`]);
  });

  it("still saves when the clean-up delete fails", async () => {
    s3.on(DeleteObjectCommand).rejects(new Error("S3 is having a moment"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(
      updateProfile({ avatarKey: `pending/sub-ann/${AVATAR_ID}` }, user("ann")),
    ).resolves.toMatchObject({ avatarUrl: expect.stringContaining("/avatars/sub-ann/") });
  });

  it("refuses bytes that aren't an image, and removes them", async () => {
    uploaded(HTML_HEADER);
    const avatarKey = `pending/sub-ann/${AVATAR_ID}`;
    await expect(updateProfile({ avatarKey }, user("ann"))).rejects.toMatchObject({ code: "VALIDATION" });
    expect(s3.commandCalls(CopyObjectCommand)).toHaveLength(0);
    expect(deletedKeys()).toEqual([avatarKey]);
    expect(table.row("USER#sub-ann", "PROFILE")?.avatarKey).toBeUndefined();
  });

  it("says so when the upload has expired", async () => {
    s3.on(GetObjectCommand).rejects(Object.assign(new Error("gone"), { name: "NoSuchKey" }));
    await expect(
      updateProfile({ avatarKey: `pending/sub-ann/${AVATAR_ID}` }, user("ann")),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("keeps the upload until the save has landed, so a retry can finish", async () => {
    let savedWhenDeleted: unknown;
    s3.on(DeleteObjectCommand).callsFake(async () => {
      savedWhenDeleted = table.row("USER#sub-ann", "PROFILE")?.avatarKey;
      return {};
    });
    await updateProfile({ avatarKey: `pending/sub-ann/${AVATAR_ID}` }, user("ann"));
    expect(savedWhenDeleted).toBe(`avatars/sub-ann/${AVATAR_ID}`);
  });

  it.each([
    ["another user's prefix", `pending/sub-bob/${AVATAR_ID}`],
    ["climbing out of the prefix", `pending/sub-ann/../sub-bob/${AVATAR_ID}`],
    ["a nested path", `pending/sub-ann/x/${AVATAR_ID}`],
    ["a key that skipped the check", `avatars/sub-ann/${AVATAR_ID}`],
    ["outside avatars", "secrets/thing"],
  ])("refuses %s", async (_label, avatarKey) => {
    await expect(updateProfile({ avatarKey }, user("ann"))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect(table.row("USER#sub-ann", "PROFILE")?.avatarKey).toBeUndefined();
  });

  it("refuses a blank or overlong name", async () => {
    await expect(updateProfile({ displayName: "   " }, user("ann"))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      updateProfile({ displayName: "x".repeat(51) }, user("ann")),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("treats nulls as no change", async () => {
    await updateProfile({ displayName: "Annie" }, user("ann"));
    await expect(
      updateProfile({ displayName: null, avatarKey: null }, user("ann")),
    ).resolves.toMatchObject({ displayName: "Annie" });
  });
});

describe("createAvatarUpload", () => {
  it("signs a post limited to five megabytes and one content type", async () => {
    const upload = await createAvatarUpload({ contentType: "image/jpeg" }, user("ann"));
    expect(upload.key).toMatch(/^pending\/sub-ann\/[0-9a-f-]{36}$/);
    expect(upload.url).toContain("avatars-bucket");

    const fields = JSON.parse(upload.fields) as Record<string, string>;
    expect(fields).toMatchObject({ key: upload.key, "Content-Type": "image/jpeg" });
    const policy = JSON.parse(Buffer.from(fields.Policy ?? "", "base64").toString("utf8")) as {
      conditions: unknown[];
    };
    expect(policy.conditions).toContainEqual(["content-length-range", 1, 5 * 1024 * 1024]);
    expect(policy.conditions).toContainEqual(["eq", "$Content-Type", "image/jpeg"]);
  });

  it("produces a key updateProfile accepts", async () => {
    const upload = await createAvatarUpload({ contentType: "image/webp" }, user("ann"));
    await expect(updateProfile({ avatarKey: upload.key }, user("ann"))).resolves.toBeDefined();
  });

  it("stops at twenty a day per person", async () => {
    for (let upload = 0; upload < 20; upload += 1) {
      await createAvatarUpload({ contentType: "image/jpeg" }, user("ann"));
    }
    await expect(createAvatarUpload({ contentType: "image/jpeg" }, user("ann"))).rejects.toMatchObject({
      code: "RATE_LIMITED",
    });
    await expect(createAvatarUpload({ contentType: "image/jpeg" }, user("bob"))).resolves.toBeDefined();
  });

  it("refuses other file types", async () => {
    await expect(
      createAvatarUpload({ contentType: "image/svg+xml" }, user("ann")),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
