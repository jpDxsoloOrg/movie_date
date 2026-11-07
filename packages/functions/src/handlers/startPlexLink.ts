import type { FieldArguments, PlexLinkStart } from "@movie-date/core";
import { deleteItem, putItem } from "../lib/db.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { claimInterval, consume, dayWindow } from "../lib/limits.js";
import { sendPlexLinkCode } from "../lib/mail.js";
import { hashLinkCode, newLinkCode, newSalt, type PlexLinkItem } from "../lib/plexLink.js";
import { findUser, type PlexAccount } from "../lib/plexRequest.js";
import { getOrCreateProfile } from "../lib/rooms.js";

const CODE_TTL_MINUTES = 10;
const SEND_INTERVAL_SECONDS = 60;
/**
 * Sign-up doesn't prove an address, so this code is all that stands between a
 * squatter and someone's Plex account. Without a daily cap, one send a minute
 * would allow 7,200 guesses a day and a steady stream of mail to the owner.
 */
const MAX_MAILS_PER_DAY = 10;
/**
 * Longer than a slow send, so a match can't be told apart by how long the answer took.
 * Sign-up is unproven, so anyone could otherwise probe a stranger's address this way.
 * A live send measured about 1.8s; the Lambda can't finish it after answering.
 */
const ANSWER_FLOOR_MS = 4_000;

const SENT: PlexLinkStart = { sent: true };

async function waitUntil(timestampMs: number): Promise<void> {
  const remaining = timestampMs - Date.now();
  if (remaining > 0) await new Promise((resolve) => setTimeout(resolve, remaining));
}

/** Swallows every failure, because only a real match gets this far. */
async function mailCode(userId: string, account: PlexAccount): Promise<void> {
  try {
    if (!(await consume(keys.userLimit(userId, "plex-link-mail", dayWindow()), MAX_MAILS_PER_DAY))) {
      return;
    }
    const code = newLinkCode();
    const salt = newSalt();
    const pending: PlexLinkItem = {
      ...keys.plexLink(userId),
      plexUserId: account.userId,
      plexEmail: account.email,
      salt,
      codeHash: await hashLinkCode(code, salt),
      attempts: 0,
      expiresAt: Math.floor(Date.now() / 1000) + CODE_TTL_MINUTES * 60,
    };
    await putItem(pending);
    await sendPlexLinkCode(account.email, code, CODE_TTL_MINUTES);
  } catch (error) {
    console.error("Plex link mail failed", error instanceof Error ? error.name : "unknown");
  }
}

export async function startPlexLink(
  _args: FieldArguments["startPlexLink"],
  context: ResolverContext,
): Promise<PlexLinkStart> {
  const { userId } = context;
  const { email, plexUserId } = await getOrCreateProfile(context);
  if (plexUserId || !email) return SENT;

  // Ahead of the lookup, so the limit behaves the same whether or not an account exists.
  const cooldown = keys.plexLinkCooldown(userId);
  if (!(await claimInterval(cooldown, SEND_INTERVAL_SECONDS))) return SENT;

  let account: PlexAccount | null;
  try {
    account = await findUser(email);
  } catch (error) {
    // Says nothing about the address, and "sent" would leave them waiting for no mail.
    await deleteItem(cooldown);
    throw error;
  }

  const answerAt = Date.now() + ANSWER_FLOOR_MS;
  if (account && account.email.toLowerCase() === email.toLowerCase()) {
    await mailCode(userId, account);
  }
  await waitUntil(answerAt);
  return SENT;
}
