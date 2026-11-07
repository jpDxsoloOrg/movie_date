import type { FieldArguments, Profile } from "@movie-date/core";
import { deleteAvatar, PENDING_PREFIX, promoteAvatar } from "../lib/avatars.js";
import { updateItem } from "../lib/db.js";
import { ForbiddenError, ValidationError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import * as keys from "../lib/keys.js";
import { getOrCreateProfile, toProfile, type ProfileItem } from "../lib/rooms.js";

const MAX_DISPLAY_NAME_LENGTH = 50;
const AVATAR_KEY_PATTERN = /^[0-9a-f-]{36}$/;

function checkedDisplayName(displayName: string): string {
  const trimmed = displayName.trim();
  if (trimmed === "") throw new ValidationError("Display name can't be empty.");
  if (trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new ValidationError(`Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`);
  }
  return trimmed;
}

/** The whole shape is checked, so `..` can't climb out of the caller's prefix. */
function uploadFileName(avatarKey: string, userId: string): string {
  const prefix = `${PENDING_PREFIX}/${userId}/`;
  const fileName = avatarKey.slice(prefix.length);
  if (!avatarKey.startsWith(prefix) || !AVATAR_KEY_PATTERN.test(fileName)) {
    throw new ForbiddenError("That image doesn't belong to you.");
  }
  return fileName;
}

export async function updateProfile(
  args: FieldArguments["updateProfile"],
  context: ResolverContext,
): Promise<Profile> {
  const { userId } = context;
  const assignments: string[] = [];
  const values: Record<string, unknown> = {};
  // Null means "leave it" as well as omitted: clients send whole forms, and no
  // screen offers removing a name or avatar.
  if (args.displayName != null) {
    assignments.push("displayName = :displayName");
    values[":displayName"] = checkedDisplayName(args.displayName);
  }
  const fileName = args.avatarKey != null ? uploadFileName(args.avatarKey, userId) : undefined;

  const profile = await getOrCreateProfile(context);
  if (args.avatarKey != null && fileName !== undefined) {
    assignments.push("avatarKey = :avatarKey");
    values[":avatarKey"] = await promoteAvatar(args.avatarKey, userId, fileName);
  }
  if (assignments.length === 0) return toProfile(profile, userId);

  const updated = await updateItem<ProfileItem>(keys.profile(userId), {
    updateExpression: `SET ${assignments.join(", ")}`,
    values,
    conditionExpression: "attribute_exists(pk)",
  });
  // Only now: a client retrying a failed save still needs the upload in place.
  if (args.avatarKey != null) {
    await deleteAvatar(args.avatarKey);
    if (profile.avatarKey && profile.avatarKey !== values[":avatarKey"]) {
      await deleteAvatar(profile.avatarKey);
    }
  }
  return toProfile(updated ?? profile, userId);
}
