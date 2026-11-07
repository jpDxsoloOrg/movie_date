import type { FieldArguments, Profile } from "@movie-date/core";
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
function checkedAvatarKey(avatarKey: string, userId: string): string {
  const prefix = `avatars/${userId}/`;
  if (!avatarKey.startsWith(prefix) || !AVATAR_KEY_PATTERN.test(avatarKey.slice(prefix.length))) {
    throw new ForbiddenError("That image doesn't belong to you.");
  }
  return avatarKey;
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
  if (args.avatarKey != null) {
    assignments.push("avatarKey = :avatarKey");
    values[":avatarKey"] = checkedAvatarKey(args.avatarKey, userId);
  }

  const profile = await getOrCreateProfile(context);
  if (assignments.length === 0) return toProfile(profile, userId);

  const updated = await updateItem<ProfileItem>(keys.profile(userId), {
    updateExpression: `SET ${assignments.join(", ")}`,
    values,
    conditionExpression: "attribute_exists(pk)",
  });
  return toProfile(updated ?? profile, userId);
}
