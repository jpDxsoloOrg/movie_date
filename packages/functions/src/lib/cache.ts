import { getItem, putItem, type Item } from "./db.js";
import { cache as cacheKey } from "./keys.js";

export const DAY_SECONDS = 86_400;

interface CacheRow<T> extends Item {
  value: T;
  expiresAt: number;
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

async function readRow<T>(kind: string, key: string): Promise<CacheRow<T> | undefined> {
  try {
    const row = await getItem<CacheRow<T>>(cacheKey(kind, key));
    // DynamoDB can leave expired rows in place for days, so TTL alone isn't a freshness check.
    return row && row.expiresAt > nowSeconds() ? row : undefined;
  } catch (error) {
    console.warn(`Cache read failed for ${kind}`, error);
    return undefined;
  }
}

/**
 * Read-through cache. A null value is a real hit, so "this movie has no trailer"
 * is remembered too. Failed loads are never stored, and a cache outage only
 * costs a trip to the upstream service.
 */
export async function cached<T>(
  kind: string,
  key: string,
  ttlSeconds: number,
  load: () => Promise<T>,
): Promise<T> {
  const row = await readRow<T>(kind, key);
  if (row) return row.value;
  const value = await load();
  try {
    await putItem({ ...cacheKey(kind, key), value, expiresAt: nowSeconds() + ttlSeconds });
  } catch (error) {
    console.warn(`Cache write failed for ${kind}`, error);
  }
  return value;
}
