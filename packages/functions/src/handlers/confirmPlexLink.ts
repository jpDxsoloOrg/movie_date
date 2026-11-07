import type { FieldArguments, Profile } from "@movie-date/core";
import {
  getItem,
  isConditionFailure,
  isTransactionCancelled,
  tableName,
  transactWrite,
  updateItem,
} from "../lib/db.js";
import { ConflictError, ValidationError } from "../lib/errors.js";
import { publishRoomEvent } from "../lib/events.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { hashesMatch, hashLinkCode, type PlexLinkItem } from "../lib/plexLink.js";
import {
  backoff,
  getOrCreateProfile,
  hasTransactionConflict,
  MAX_TRANSACTION_ATTEMPTS,
  toProfile,
  type ProfileItem,
} from "../lib/rooms.js";

const MAX_ATTEMPTS = 5;
const CODE_PATTERN = /^\d{6}$/;
/** Hashed when there's no pending code, so that case takes as long as a wrong guess. */
const PLACEHOLDER_SALT = "no-pending-code";

/**
 * One answer for every failure. "Expired" or "too many tries" would confirm a code
 * was ever sent, and so that the address has a Plex Request account.
 */
function wrongCode(): ValidationError {
  return new ValidationError("That code isn't right, or it has expired.");
}

/** The count goes up before the code is compared, so parallel guesses can't share an attempt. */
async function takeAttempt(userId: string): Promise<PlexLinkItem | undefined> {
  try {
    return await updateItem<PlexLinkItem>(keys.plexLink(userId), {
      updateExpression: "ADD attempts :one",
      values: {
        ":one": 1,
        ":maxAttempts": MAX_ATTEMPTS,
        ":now": Math.floor(Date.now() / 1000),
      },
      conditionExpression:
        "attribute_exists(pk) AND attempts < :maxAttempts AND expiresAt >= :now",
    });
  } catch (error) {
    if (isConditionFailure(error)) return undefined;
    throw error;
  }
}

async function codeIsRight(code: string, pending: PlexLinkItem | undefined): Promise<boolean> {
  const hash = await hashLinkCode(code, pending?.salt ?? PLACEHOLDER_SALT);
  return pending !== undefined && hashesMatch(hash, pending.codeHash);
}

/** Using up the code in the same transaction is what makes it single use. */
async function commitLink(userId: string, pending: PlexLinkItem): Promise<void> {
  const profileKey = keys.profile(userId);
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      await transactWrite([
        {
          Update: {
            TableName: tableName(),
            Key: profileKey,
            UpdateExpression: "SET plexUserId = :plexUserId, plexEmail = :plexEmail",
            ConditionExpression: "attribute_exists(pk)",
            ExpressionAttributeValues: {
              ":plexUserId": pending.plexUserId,
              ":plexEmail": pending.plexEmail,
            },
          },
        },
        {
          Delete: {
            TableName: tableName(),
            Key: keys.plexLink(userId),
            ConditionExpression: "attribute_exists(pk)",
          },
        },
      ]);
      return;
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      if (!hasTransactionConflict(error)) {
        // Lost to a double press of the same right code, which already did the work.
        const current = await getItem<ProfileItem>(profileKey, { consistent: true });
        if (current?.plexUserId) return;
        throw wrongCode();
      }
      await backoff(attempt);
    }
  }
  throw new ConflictError();
}

export async function confirmPlexLink(
  { code }: FieldArguments["confirmPlexLink"],
  context: ResolverContext,
): Promise<Profile> {
  const { userId } = context;
  const profile = await getOrCreateProfile(context);
  if (profile.plexUserId) return toProfile(profile, userId);
  if (!CODE_PATTERN.test(code)) throw wrongCode();

  const pending = await takeAttempt(userId);
  if (!(await codeIsRight(code, pending)) || !pending) throw wrongCode();

  await commitLink(userId, pending);
  await publishRoomEvent({ roomId: profile.roomId, type: "ROOM_UPDATED", actorId: userId });
  return toProfile({ ...profile, plexUserId: pending.plexUserId }, userId);
}
