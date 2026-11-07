import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { ValidationError } from "./errors.js";

/** Uploads land here and only leave through `promoteAvatar`; a lifecycle rule clears the rest. */
export const PENDING_PREFIX = "pending";
export const AVATAR_PREFIX = "avatars";

const HEADER_BYTES = 12;

let s3Client: S3Client | undefined;

export function getS3Client(): S3Client {
  s3Client ??= new S3Client({});
  return s3Client;
}

export function avatarsBucket(): string {
  const bucket = process.env.AVATARS_BUCKET;
  if (!bucket) throw new Error("AVATARS_BUCKET is not set");
  return bucket;
}

function startsWith(header: Uint8Array, bytes: readonly number[], offset = 0): boolean {
  return bytes.every((byte, index) => header[offset + index] === byte);
}

const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** The presigned POST can only pin a declared type, so the bytes are checked here. */
export function isImageHeader(header: Uint8Array): boolean {
  return (
    startsWith(header, [0xff, 0xd8, 0xff]) ||
    startsWith(header, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) ||
    (startsWith(header, RIFF) && startsWith(header, WEBP, 8))
  );
}

function isMissing(error: unknown): boolean {
  return error instanceof Error && error.name === "NoSuchKey";
}

async function readHeader(key: string): Promise<Uint8Array> {
  try {
    const { Body } = await getS3Client().send(
      new GetObjectCommand({
        Bucket: avatarsBucket(),
        Key: key,
        Range: `bytes=0-${HEADER_BYTES - 1}`,
      }),
    );
    return (await Body?.transformToByteArray()) ?? new Uint8Array();
  } catch (error) {
    if (isMissing(error)) throw new ValidationError("That upload has expired. Please choose the photo again.");
    throw error;
  }
}

/** Copies a checked upload to where it is served from, and returns that key. */
export async function promoteAvatar(pendingKey: string, userId: string, fileName: string): Promise<string> {
  if (!isImageHeader(await readHeader(pendingKey))) {
    await deleteAvatar(pendingKey);
    throw new ValidationError("That file isn't a JPEG, PNG or WebP image.");
  }
  const bucket = avatarsBucket();
  const key = `${AVATAR_PREFIX}/${userId}/${fileName}`;
  await getS3Client().send(
    new CopyObjectCommand({ Bucket: bucket, Key: key, CopySource: `${bucket}/${pendingKey}` }),
  );
  return key;
}

/** Housekeeping after the profile has moved on, so a failure mustn't fail the save. */
export async function deleteAvatar(key: string): Promise<void> {
  try {
    await getS3Client().send(new DeleteObjectCommand({ Bucket: avatarsBucket(), Key: key }));
  } catch (error) {
    console.warn("Avatar delete failed", error instanceof Error ? error.name : "unknown");
  }
}
