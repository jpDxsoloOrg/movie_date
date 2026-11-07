import { randomUUID } from "node:crypto";
import { S3Client } from "@aws-sdk/client-s3";
import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import type { AvatarUpload, FieldArguments } from "@movie-date/core";
import { ValidationError } from "../lib/errors.js";
import type { ResolverContext } from "../lib/identity.js";

const ALLOWED_CONTENT_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const UPLOAD_EXPIRY_SECONDS = 300;

let s3Client: S3Client | undefined;

function getS3Client(): S3Client {
  s3Client ??= new S3Client({});
  return s3Client;
}

export async function createAvatarUpload(
  args: FieldArguments["createAvatarUpload"],
  context: ResolverContext,
): Promise<AvatarUpload> {
  const { contentType } = args;
  if (!ALLOWED_CONTENT_TYPES.has(contentType)) {
    throw new ValidationError("Avatars must be JPEG, PNG or WebP images.");
  }
  const bucket = process.env.AVATARS_BUCKET;
  if (!bucket) throw new Error("AVATARS_BUCKET is not set");

  const key = `avatars/${context.userId}/${randomUUID()}`;
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
