import { randomUUID } from "node:crypto";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { AvatarUpload, FieldArguments } from "@movie-date/core";
import { avatarsBucket, getS3Client, PENDING_PREFIX } from "../lib/avatars.js";
import { RateLimitedError, ValidationError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";
import { userLimit } from "../lib/keys.js";
import { consume, dayWindow } from "../lib/limits.js";

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const UPLOAD_EXPIRY_SECONDS = 300;
const DAILY_UPLOAD_LIMIT = 20;

export async function createAvatarUpload(
  args: FieldArguments["createAvatarUpload"],
  context: ResolverContext,
): Promise<AvatarUpload> {
  const { contentType } = args;
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ValidationError("Avatars must be JPEG, PNG or WebP images.");
  }
  const bucket = avatarsBucket();
  if (!(await consume(userLimit(context.userId, "avatar", dayWindow()), DAILY_UPLOAD_LIMIT))) {
    throw new RateLimitedError("That's enough new photos for today. Try again tomorrow.");
  }

  const key = `${PENDING_PREFIX}/${context.userId}/${randomUUID()}`;
  const { url, fields } = await createPresignedPost(getS3Client(), {
    Bucket: bucket,
    Key: key,
    Fields: { "Content-Type": contentType },
    Conditions: [
      ["content-length-range", 1, MAX_AVATAR_BYTES],
      ["eq", "$Content-Type", contentType],
    ],
    Expires: UPLOAD_EXPIRY_SECONDS,
  });
  return { url, fields: JSON.stringify(fields), key };
}
