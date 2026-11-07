import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { Item } from "./db.js";

const CODE_SPACE = 1_000_000;
const CODE_LENGTH = 6;
const HASH_BYTES = 32;

const derive = promisify(scrypt) as (code: string, salt: string, length: number) => Promise<Buffer>;

export interface PlexLinkItem extends Item {
  plexUserId: string;
  plexEmail: string;
  salt: string;
  codeHash: string;
  attempts: number;
  expiresAt: number;
}

export function newLinkCode(): string {
  return String(randomInt(CODE_SPACE)).padStart(CODE_LENGTH, "0");
}

export function newSalt(): string {
  return randomBytes(16).toString("hex");
}

/** Slow on purpose: a million codes is nothing to a plain hash if the table ever leaked. */
export async function hashLinkCode(code: string, salt: string): Promise<string> {
  return (await derive(code, salt, HASH_BYTES)).toString("hex");
}

export function hashesMatch(first: string, second: string): boolean {
  const firstBytes = Buffer.from(first, "hex");
  const secondBytes = Buffer.from(second, "hex");
  return firstBytes.length === secondBytes.length && timingSafeEqual(firstBytes, secondBytes);
}
