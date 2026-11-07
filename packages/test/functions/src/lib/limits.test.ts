import { claimInterval, consume, isExhausted, recordFailure, refund } from "@movie-date/functions/lib/limits";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FakeDynamo } from "../support/fakeDynamo";

const key = { pk: "USER#a", sk: "LIMIT#test#window" };
let table: FakeDynamo;

beforeEach(() => {
  table = new FakeDynamo();
});

afterEach(() => {
  table.restore();
});

describe("consume", () => {
  it("allows exactly the limit, then refuses without counting", async () => {
    expect(await consume(key, 2)).toBe(true);
    expect(await consume(key, 2)).toBe(true);
    expect(await consume(key, 2)).toBe(false);
    expect(table.row(key.pk, key.sk)?.count).toBe(2);
  });

  it("sets the expiry once, so a busy window can't keep its row alive", async () => {
    await consume(key, 5, 100);
    const first = table.row(key.pk, key.sk)?.expiresAt;
    await consume(key, 5, 100_000);
    expect(first).toEqual(expect.any(Number));
    expect(table.row(key.pk, key.sk)?.expiresAt).toBe(first);
  });
});

describe("recordFailure", () => {
  it("counts toward isExhausted", async () => {
    expect(await isExhausted(key, 2)).toBe(false);
    await recordFailure(key, 100);
    expect(await isExhausted(key, 2)).toBe(false);
    await recordFailure(key, 100);
    expect(await isExhausted(key, 2)).toBe(true);
  });
});

describe("refund", () => {
  it("makes room for one more", async () => {
    await consume(key, 1);
    await refund(key);
    expect(await consume(key, 1)).toBe(true);
  });
});

describe("claimInterval", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("measures from the claim, not a calendar boundary", async () => {
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-03-01T10:00:59Z") });
    expect(await claimInterval(key, 60)).toBe(true);
    vi.setSystemTime(new Date("2026-03-01T10:01:01Z"));
    expect(await claimInterval(key, 60)).toBe(false);
    vi.setSystemTime(new Date("2026-03-01T10:02:00Z"));
    expect(await claimInterval(key, 60)).toBe(true);
  });

  it("lets one of two simultaneous claims win", async () => {
    const claims = await Promise.all([claimInterval(key, 60), claimInterval(key, 60)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
  });

  it("doesn't push the window out on a refused claim", async () => {
    await claimInterval(key, 60);
    const expiry = table.row(key.pk, key.sk)?.expiresAt;
    await claimInterval(key, 60);
    expect(table.row(key.pk, key.sk)?.expiresAt).toBe(expiry);
  });
});
