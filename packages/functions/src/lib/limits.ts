import { getItem, isConditionFailure, updateItem, type Item } from "./db.js";
import type { TableKey } from "./keys.js";

export const HOUR_SECONDS = 3_600;
const DAY_SECONDS = 86_400;

interface LimitRow extends Item {
  count?: number;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

/** Windows are calendar UTC, and a row is kept one window past its end. */
export function dayWindow(): string {
  return new Date().toISOString().slice(0, 10);
}

export function hourWindow(): string {
  return new Date().toISOString().slice(0, 13);
}

function countUpdate(ttlSeconds: number) {
  return {
    updateExpression: "SET expiresAt = if_not_exists(expiresAt, :expiresAt) ADD #count :one",
    names: { "#count": "count" },
    values: { ":one": 1, ":expiresAt": nowSeconds() + ttlSeconds },
  };
}

/** Takes one unit. False once `limit` have gone in this window, and nothing is taken. */
export async function consume(key: TableKey, limit: number, ttlSeconds = 2 * DAY_SECONDS): Promise<boolean> {
  const update = countUpdate(ttlSeconds);
  try {
    await updateItem(key, {
      ...update,
      values: { ...update.values, ":limit": limit },
      conditionExpression: "attribute_not_exists(#count) OR #count < :limit",
    });
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}

/** Gives back a unit whose work never happened. */
export async function refund(key: TableKey): Promise<void> {
  await updateItem(key, {
    updateExpression: "ADD #count :minusOne",
    names: { "#count": "count" },
    values: { ":minusOne": -1 },
  });
}

/**
 * True at most once per interval, measured from the last claim. Calendar windows
 * would let two through either side of a boundary.
 */
export async function claimInterval(key: TableKey, intervalSeconds: number): Promise<boolean> {
  const now = nowSeconds();
  try {
    await updateItem(key, {
      updateExpression: "SET expiresAt = :next",
      values: { ":next": now + intervalSeconds, ":now": now },
      conditionExpression: "attribute_not_exists(expiresAt) OR expiresAt < :now",
    });
    return true;
  } catch (error) {
    if (isConditionFailure(error)) return false;
    throw error;
  }
}

/** For counting only failures: check with this first, record with `recordFailure`. */
export async function isExhausted(key: TableKey, limit: number): Promise<boolean> {
  const row = await getItem<LimitRow>(key, { consistent: true });
  return (row?.count ?? 0) >= limit;
}

export async function recordFailure(key: TableKey, ttlSeconds: number): Promise<void> {
  await updateItem(key, countUpdate(ttlSeconds));
}
