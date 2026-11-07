import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import type { Room } from "@movie-date/core";
import { confirmPlexLink } from "@movie-date/functions/handlers/confirmPlexLink";
import { me } from "@movie-date/functions/handlers/me";
import { myRoom } from "@movie-date/functions/handlers/myRoom";
import { startPlexLink } from "@movie-date/functions/handlers/startPlexLink";
import { unlinkPlex } from "@movie-date/functions/handlers/unlinkPlex";
import { UpstreamError, ValidationError } from "@movie-date/functions/lib/errors";
import { publishRoomEvent } from "@movie-date/functions/lib/events";
import { hashLinkCode } from "@movie-date/functions/lib/plexLink";
import { mockClient } from "aws-sdk-client-mock";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";
import { fakePlexRequest } from "../support/plexRequestFake";
import { roomOf, user } from "../support/roomFixture";

vi.mock("@movie-date/functions/lib/events");
vi.mock("@movie-date/functions/lib/plexLink", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@movie-date/functions/lib/plexLink")>();
  return { ...actual, hashLinkCode: vi.fn(actual.hashLinkCode) };
});

const ANA = user("ana");
const BEN = user("ben");
const WRONG_CODE_MESSAGE = "That code isn't right, or it has expired.";
const realSetTimeout = globalThis.setTimeout;

const ses = mockClient(SESv2Client);
const plexRequest = fakePlexRequest();
let dynamo: FakeDynamo;
let waits: number[];

/** Everyone in `linked` has a Plex Request account under their own email. */
function givenAccounts(...linked: { userId: string; email?: string }[]): void {
  plexRequest.answer(({ op, email }) => {
    if (op !== "findUser") throw new Error(`Unexpected op ${op}`);
    const account = linked.find((candidate) => candidate.email === email);
    return account ? { userId: `plex-${account.userId}`, email } : null;
  });
}

function mailedCode(index = 0): string {
  const body = ses.commandCalls(SendEmailCommand)[index]?.args[0].input.Content?.Simple?.Body?.Text?.Data;
  const code = /\b\d{6}\b/.exec(body ?? "")?.[0];
  if (!code) throw new Error("No code was mailed");
  return code;
}

function differentCode(code: string): string {
  return code === "000000" ? "000001" : "000000";
}

function pendingRow(name: string) {
  return dynamo.row(`USER#sub-${name}`, "PLEX_LINK");
}

async function linkedRoom(): Promise<Room> {
  givenAccounts(ANA);
  const room = await roomOf("ana", "ben");
  await startPlexLink({}, ANA);
  await confirmPlexLink({ code: mailedCode() }, ANA);
  return room;
}

beforeEach(() => {
  dynamo = new FakeDynamo();
  ses.reset();
  ses.on(SendEmailCommand).resolves({ MessageId: "message" });
  plexRequest.reset();
  process.env.PLEX_INTEGRATION_FUNCTION = "integration";
  process.env.MAIL_FROM = "noreply@jpdxsolo.com";
  waits = [];
  // Records the answer floor rather than sitting through it.
  vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: () => void, delay?: number) => {
    waits.push(delay ?? 0);
    return realSetTimeout(callback, 0);
  }) as typeof setTimeout);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  dynamo.restore();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.mocked(publishRoomEvent).mockClear();
  vi.mocked(hashLinkCode).mockClear();
});

afterAll(() => {
  ses.restore();
  plexRequest.restore();
});

describe("startPlexLink", () => {
  it("mails a 6-digit code from noreply to the caller's own address", async () => {
    givenAccounts(ANA);
    expect(await startPlexLink({}, ANA)).toEqual({ sent: true });
    const [call] = ses.commandCalls(SendEmailCommand);
    expect(call?.args[0].input.FromEmailAddress).toBe("noreply@jpdxsolo.com");
    expect(call?.args[0].input.Destination?.ToAddresses).toEqual([ANA.email]);
    expect(mailedCode()).toMatch(/^\d{6}$/);
  });

  it("looks up the profile's email, not one from the token", async () => {
    givenAccounts(ANA);
    await me({}, ANA);
    await startPlexLink({}, { userId: ANA.userId, email: "someone-else@example.com" });
    expect(plexRequest.callsTo("findUser")).toEqual([{ op: "findUser", email: ANA.email }]);
  });

  it("stores only a salted hash, with a 10 minute life", async () => {
    givenAccounts(ANA);
    const before = Math.floor(Date.now() / 1000);
    await startPlexLink({}, ANA);
    const row = pendingRow("ana");
    expect(JSON.stringify(row)).not.toContain(mailedCode());
    expect(row?.salt).toEqual(expect.any(String));
    expect(row?.codeHash).toEqual(expect.any(String));
    expect(row?.attempts).toBe(0);
    expect(row?.expiresAt).toBeGreaterThanOrEqual(before + 600);
    expect(row?.expiresAt).toBeLessThanOrEqual(before + 602);
  });

  it("hashes the same code differently for different salts", async () => {
    expect(await hashLinkCode("123456", "salt-a")).not.toBe(await hashLinkCode("123456", "salt-b"));
  });
});

describe("startPlexLink enumeration resistance", () => {
  it("answers an address with no account exactly like one with an account", async () => {
    givenAccounts(ANA);
    const withAccount = await startPlexLink({}, ANA);
    const withoutAccount = await startPlexLink({}, BEN);
    expect(withoutAccount).toEqual(withAccount);
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(1);
    expect(pendingRow("ben")).toBeUndefined();
  });

  it("holds both answers to the same floor, so timing doesn't tell them apart", async () => {
    givenAccounts(ANA);
    await startPlexLink({}, BEN);
    expect(waits).toHaveLength(1);
    const noMatchWait = waits[0] ?? 0;
    expect(noMatchWait).toBeGreaterThan(500);
    await startPlexLink({}, ANA);
    expect(waits).toHaveLength(2);
    expect(waits[1]).toBeGreaterThan(0);
    expect(waits[1]).toBeLessThanOrEqual(noMatchWait);
  });

  it("still answers sent when the mail itself fails", async () => {
    givenAccounts(ANA);
    ses.on(SendEmailCommand).rejects(new Error("SES is down"));
    expect(await startPlexLink({}, ANA)).toEqual({ sent: true });
  });

  it("gives a Plex Request outage the same answer for everyone, and allows a retry", async () => {
    plexRequest.breakIt();
    await expect(startPlexLink({}, ANA)).rejects.toBeInstanceOf(UpstreamError);
    await expect(startPlexLink({}, BEN)).rejects.toBeInstanceOf(UpstreamError);
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(1);
  });

  it("never logs the address or the code", async () => {
    givenAccounts(ANA);
    ses.on(SendEmailCommand).rejects(new Error("Failed for ana@example.com"));
    await startPlexLink({}, ANA);
    plexRequest.breakIt();
    await startPlexLink({}, BEN).catch(() => undefined);
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain("@example.com");
  });
});

describe("send limits", () => {
  it("sends once a minute, measured from the last send", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-01T10:00:59Z") });
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    vi.setSystemTime(new Date("2026-03-01T10:01:30Z"));
    expect(await startPlexLink({}, ANA)).toEqual({ sent: true });
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(1);
    vi.setSystemTime(new Date("2026-03-01T10:02:01Z"));
    await startPlexLink({}, ANA);
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(2);
  });

  it("lets only one of two simultaneous presses through", async () => {
    givenAccounts(ANA);
    await me({}, ANA);
    await Promise.all([startPlexLink({}, ANA), startPlexLink({}, ANA)]);
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(1);
  });

  it("applies the same limit to an address with no account", async () => {
    givenAccounts();
    await startPlexLink({}, ANA);
    await startPlexLink({}, ANA);
    expect(plexRequest.callsTo("findUser")).toHaveLength(1);
  });

  it("keeps a resent limit from also killing the code already in the post", async () => {
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    await startPlexLink({}, ANA);
    const linked = await confirmPlexLink({ code: mailedCode() }, ANA);
    expect(linked.plexLinked).toBe(true);
  });

  it("stops mailing after 10 in a day", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-01T10:00:00Z") });
    givenAccounts(ANA);
    for (let minute = 0; minute < 12; minute += 1) {
      vi.setSystemTime(new Date(Date.UTC(2026, 2, 1, 10, minute * 2)));
      expect(await startPlexLink({}, ANA)).toEqual({ sent: true });
    }
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(10);
  });

  it("sends nothing to someone already linked", async () => {
    await linkedRoom();
    ses.resetHistory();
    await startPlexLink({}, ANA);
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
  });
});

describe("confirmPlexLink", () => {
  it("links the caller to the account the code was sent for", async () => {
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    const profile = await confirmPlexLink({ code: mailedCode() }, ANA);
    expect(profile.plexLinked).toBe(true);
    expect((await me({}, ANA)).plexLinked).toBe(true);
    const row = dynamo.row("USER#sub-ana", "PROFILE");
    expect(row?.plexUserId).toBe("plex-sub-ana");
    expect(row?.plexEmail).toBe(ANA.email);
  });

  it("doesn't expose the Plex Request id on the profile", async () => {
    await linkedRoom();
    expect(JSON.stringify(await me({}, ANA))).not.toContain("plex-sub-ana");
  });

  it("publishes ROOM_UPDATED and unlocks Plex for the whole room", async () => {
    const room = await linkedRoom();
    expect(publishRoomEvent).toHaveBeenCalledWith({
      roomId: room.id,
      type: "ROOM_UPDATED",
      actorId: ANA.userId,
    });
    expect((await myRoom({}, BEN)).plexAvailable).toBe(true);
  });

  it("works once", async () => {
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    const code = mailedCode();
    await confirmPlexLink({ code }, ANA);
    expect(pendingRow("ana")).toBeUndefined();
    await unlinkPlex({}, ANA);
    await expect(confirmPlexLink({ code }, ANA)).rejects.toThrow(WRONG_CODE_MESSAGE);
  });

  it("survives a double press of the right code", async () => {
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    const code = mailedCode();
    const results = await Promise.allSettled([
      confirmPlexLink({ code }, ANA),
      confirmPlexLink({ code }, ANA),
    ]);
    expect(results.filter((result) => result.status === "fulfilled").length).toBeGreaterThan(0);
    expect((await me({}, ANA)).plexLinked).toBe(true);
    expect(vi.mocked(publishRoomEvent).mock.calls.length).toBeGreaterThan(0);
  });

  it("refuses a malformed code without spending an attempt", async () => {
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    await expect(confirmPlexLink({ code: "12a456" }, ANA)).rejects.toBeInstanceOf(ValidationError);
    expect(pendingRow("ana")?.attempts).toBe(0);
  });
});

describe("attempt limit", () => {
  it("locks the code after 5 wrong tries, even for the right code", async () => {
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    const code = mailedCode();
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(confirmPlexLink({ code: differentCode(code) }, ANA)).rejects.toThrow(WRONG_CODE_MESSAGE);
    }
    await expect(confirmPlexLink({ code }, ANA)).rejects.toThrow(WRONG_CODE_MESSAGE);
    expect((await me({}, ANA)).plexLinked).toBe(false);
  });

  it("counts parallel guesses atomically", async () => {
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    const code = mailedCode();
    const wrong = differentCode(code);
    await Promise.allSettled(Array.from({ length: 20 }, () => confirmPlexLink({ code: wrong }, ANA)));
    expect(pendingRow("ana")?.attempts).toBe(5);
    await expect(confirmPlexLink({ code }, ANA)).rejects.toThrow(WRONG_CODE_MESSAGE);
  });

  it("refuses a right code after 10 minutes, even if the row hasn't been swept", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-01T10:00:00Z") });
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    vi.setSystemTime(new Date("2026-03-01T10:10:01Z"));
    expect(pendingRow("ana")).toBeDefined();
    await expect(confirmPlexLink({ code: mailedCode() }, ANA)).rejects.toThrow(WRONG_CODE_MESSAGE);
  });
});

describe("confirmPlexLink enumeration resistance", () => {
  function failure(code: string, caller = ANA): Promise<unknown> {
    return confirmPlexLink({ code }, caller).catch((error: unknown) => error);
  }

  it("answers no pending code, a wrong, an expired and a locked code identically", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-01T10:00:00Z") });
    givenAccounts(ANA);
    const noPending = await failure("123456", BEN);
    expect(noPending).toBeInstanceOf(ValidationError);

    await startPlexLink({}, ANA);
    const code = mailedCode();
    const wrong = differentCode(code);
    expect(await failure(wrong)).toEqual(noPending);
    for (let attempt = 0; attempt < 4; attempt += 1) await failure(wrong);
    expect(await failure(code)).toEqual(noPending);

    vi.setSystemTime(new Date("2026-03-01T10:02:00Z"));
    await startPlexLink({}, ANA);
    vi.setSystemTime(new Date("2026-03-01T10:13:00Z"));
    expect(await failure(mailedCode(1))).toEqual(noPending);
  });

  it("does the same hashing work with nothing pending", async () => {
    await failure("123456", BEN);
    expect(hashLinkCode).toHaveBeenCalledTimes(1);
  });
});

describe("one user can never act as another", () => {
  it("won't let someone else's code link the caller", async () => {
    givenAccounts(ANA, BEN);
    await startPlexLink({}, ANA);
    await expect(confirmPlexLink({ code: mailedCode() }, BEN)).rejects.toThrow(WRONG_CODE_MESSAGE);
    expect((await me({}, BEN)).plexLinked).toBe(false);
    expect(dynamo.row("USER#sub-ben", "PROFILE")?.plexUserId).toBeUndefined();
  });

  it("doesn't spend the owner's attempts on someone else's guess", async () => {
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    await confirmPlexLink({ code: mailedCode() }, BEN).catch(() => undefined);
    expect(pendingRow("ana")?.attempts).toBe(0);
  });

  it("links an account only to the user who proved the code, whatever else they hold", async () => {
    givenAccounts(ANA, BEN);
    await startPlexLink({}, ANA);
    await startPlexLink({}, BEN);
    await confirmPlexLink({ code: mailedCode(1) }, BEN);
    expect(dynamo.row("USER#sub-ben", "PROFILE")?.plexUserId).toBe("plex-sub-ben");
    expect(dynamo.row("USER#sub-ana", "PROFILE")?.plexUserId).toBeUndefined();
  });

  it("won't mail a code if the account answers for a different address", async () => {
    plexRequest.answer(() => ({ userId: "plex-other", email: "other@example.com" }));
    await startPlexLink({}, ANA);
    expect(ses.commandCalls(SendEmailCommand)).toHaveLength(0);
  });
});

describe("unlinkPlex", () => {
  it("clears the link and re-locks the room", async () => {
    await linkedRoom();
    const profile = await unlinkPlex({}, ANA);
    expect(profile.plexLinked).toBe(false);
    expect(dynamo.row("USER#sub-ana", "PROFILE")?.plexUserId).toBeUndefined();
    expect(dynamo.row("USER#sub-ana", "PROFILE")?.plexEmail).toBeUndefined();
    expect((await myRoom({}, BEN)).plexAvailable).toBe(false);
  });

  it("publishes ROOM_UPDATED", async () => {
    const room = await linkedRoom();
    vi.mocked(publishRoomEvent).mockClear();
    await unlinkPlex({}, ANA);
    expect(publishRoomEvent).toHaveBeenCalledWith({
      roomId: room.id,
      type: "ROOM_UPDATED",
      actorId: ANA.userId,
    });
  });

  it("is a quiet no-op when not linked", async () => {
    expect((await unlinkPlex({}, ANA)).plexLinked).toBe(false);
    expect(publishRoomEvent).not.toHaveBeenCalled();
  });

  it("voids a code that's still pending", async () => {
    givenAccounts(ANA);
    await startPlexLink({}, ANA);
    await unlinkPlex({}, ANA);
    await expect(confirmPlexLink({ code: mailedCode() }, ANA)).rejects.toThrow(WRONG_CODE_MESSAGE);
  });

  it("leaves other members' links alone", async () => {
    await linkedRoom();
    await unlinkPlex({}, BEN);
    expect((await me({}, ANA)).plexLinked).toBe(true);
    expect((await myRoom({}, ANA)).plexAvailable).toBe(true);
  });
});

describe("room availability", () => {
  it("stays locked with no linked member", async () => {
    await roomOf("ana", "ben");
    expect((await myRoom({}, ANA)).plexAvailable).toBe(false);
  });
});
