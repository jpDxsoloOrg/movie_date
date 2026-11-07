import { consume, isExhausted, recordFailure } from "@movie-date/functions/lib/limits";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
