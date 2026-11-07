import { randomUUID } from "node:crypto";
import {
  DEFAULT_MATCH_THRESHOLD,
  effectiveThreshold,
  emptyFilters,
  generateRoomCode,
  type Filters,
  type Member,
  type Match,
  type Movie,
  type Profile,
  type Room,
  type SwipeDirection,
} from "@movie-date/core";
import {
  cancellationCodes,
  getItem,
  isTransactionCancelled,
  queryAll,
  tableName,
  transactWrite,
  updateItem,
  type Item,
  type TransactItems,
  type UpdateOptions,
} from "./db.js";
import { ConflictError, NotFoundError } from "./errors.js";
import type { ResolverContext } from "./identity.js";
import * as keys from "./keys.js";

export interface ProfileItem extends Item {
  email: string;
  displayName: string;
  avatarKey?: string;
  roomId: string;
  createdAt: string;
}

export interface RoomMetaItem extends Item {
  code: string;
  filters: Filters;
  matchThreshold: number;
  requireMajority: boolean;
  round: number;
  createdAt: string;
}

export interface MemberItem extends Item {
  joinedAt: string;
}

export interface RoomCodeItem extends Item {
  roomId: string;
}

export interface SwipeItem extends Item {
  movieId: number;
  direction: SwipeDirection;
  swipedAt: string;
  movie: Movie;
}

export interface TallyItem extends Item {
  movieId: number;
  likes: number;
  movie: Movie;
}

export interface MatchItem extends Item {
  matchId: string;
  movieId: number;
  round: number;
  matchedAt: string;
  movie: Movie;
}

export interface MatchedItem extends Item {
  matchId: string;
  movieId: number;
  matchSk: string;
}

const CONDITION_FAILED = "ConditionalCheckFailed";
const TRANSACTION_CONFLICT = "TransactionConflict";

/**
 * DynamoDB cancels, rather than queues, a transaction touching an item another
 * transaction holds, and the SDK doesn't retry that. Two people liking the same
 * movie at once is the moment this app exists for, so every transaction runs in
 * a loop bounded by this.
 */
export const MAX_TRANSACTION_ATTEMPTS = 8;

const BACKOFF_BASE_MS = 20;
const BACKOFF_CAP_MS = 500;

/** Full jitter, so two swipes that collided don't collide again on the same beat. */
export async function backoff(attempt: number): Promise<void> {
  const ceiling = Math.min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt);
  await new Promise((resolve) => setTimeout(resolve, Math.random() * ceiling));
}

export function failedCondition(code: string | undefined): boolean {
  return code === CONDITION_FAILED;
}

export function hasTransactionConflict(error: unknown): boolean {
  return cancellationCodes(error).includes(TRANSACTION_CONFLICT);
}

function avatarUrl(avatarKey: string | undefined): string | null {
  const bucket = process.env.AVATARS_BUCKET;
  return avatarKey && bucket ? `https://${bucket}.s3.amazonaws.com/${avatarKey}` : null;
}

export function toProfile(item: ProfileItem, userId: string): Profile {
  return {
    id: userId,
    email: item.email,
    displayName: item.displayName,
    avatarUrl: avatarUrl(item.avatarKey),
  };
}

export function toMatch(item: MatchItem, roomId: string): Match {
  return {
    id: item.matchId,
    roomId,
    round: item.round,
    matchedAt: item.matchedAt,
    movie: item.movie,
  };
}

/** The code row is conditional: a collision cancels the transaction and the caller draws again. */
export function newRoomWrites(roomId: string, code: string, now: string): TransactItems {
  const meta: RoomMetaItem = {
    ...keys.roomMeta(roomId),
    code,
    filters: emptyFilters(),
    matchThreshold: DEFAULT_MATCH_THRESHOLD,
    requireMajority: false,
    round: 1,
    createdAt: now,
  };
  return [
    { Put: { TableName: tableName(), Item: meta } },
    {
      Put: {
        TableName: tableName(),
        Item: { ...keys.roomCode(code), roomId },
        ConditionExpression: "attribute_not_exists(pk)",
      },
    },
  ];
}

function defaultDisplayName(email: string): string {
  return email.split("@")[0] || "Movie Fan";
}

/**
 * Any first call may land here, not just `me`: a client fires `me` and `myRoom`
 * together on first login. The profile, room, membership and code go in one
 * transaction with the profile conditional, so concurrent callers can't each
 * keep a room, and the loser simply reads the winner's profile.
 */
export async function getOrCreateProfile(context: ResolverContext): Promise<ProfileItem> {
  const profileKey = keys.profile(context.userId);
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    const existing = await getItem<ProfileItem>(profileKey, { consistent: true });
    if (existing) return existing;

    const now = new Date().toISOString();
    const roomId = randomUUID();
    const email = context.email ?? "";
    const profile: ProfileItem = {
      ...profileKey,
      email,
      displayName: defaultDisplayName(email),
      roomId,
      createdAt: now,
    };
    const memberRow: MemberItem = { ...keys.member(roomId, context.userId), joinedAt: now };
    try {
      await transactWrite([
        {
          Put: {
            TableName: tableName(),
            Item: profile,
            ConditionExpression: "attribute_not_exists(pk)",
          },
        },
        { Put: { TableName: tableName(), Item: memberRow } },
        ...newRoomWrites(roomId, generateRoomCode(), now),
      ]);
      return profile;
    } catch (error) {
      if (!isTransactionCancelled(error)) throw error;
      await backoff(attempt);
    }
  }
  throw new ConflictError();
}

export async function requireRoomMeta(roomId: string): Promise<RoomMetaItem> {
  const meta = await getItem<RoomMetaItem>(keys.roomMeta(roomId), { consistent: true });
  if (!meta) throw new NotFoundError("Room not found.");
  return meta;
}

/**
 * A plain write to META is refused outright while a match transaction is checking
 * the round on it, so pressing Back to Start at that moment must not surface as
 * an error.
 */
export async function updateRoomMeta(
  roomId: string,
  options: UpdateOptions,
): Promise<RoomMetaItem | undefined> {
  for (let attempt = 0; attempt < MAX_TRANSACTION_ATTEMPTS; attempt += 1) {
    try {
      return await updateItem<RoomMetaItem>(keys.roomMeta(roomId), options);
    } catch (error) {
      if (!(error instanceof Error) || error.name !== "TransactionConflictException") throw error;
      await backoff(attempt);
    }
  }
  throw new ConflictError();
}

export async function loadMemberRows(roomId: string): Promise<MemberItem[]> {
  return queryAll<MemberItem>(keys.roomPk(roomId), {
    skPrefix: keys.prefixes.members(),
    consistent: true,
  });
}

function memberUserId(row: MemberItem): string {
  return row.sk.slice(keys.prefixes.members().length);
}

async function loadMembers(rows: MemberItem[], callerId: string): Promise<Member[]> {
  const ordered = [...rows].sort((first, second) => first.joinedAt.localeCompare(second.joinedAt));
  const profiles = await Promise.all(
    ordered.map((row) => getItem<ProfileItem>(keys.profile(memberUserId(row)))),
  );
  return ordered.flatMap((row, index) => {
    const memberProfile = profiles[index];
    if (!memberProfile) return [];
    const userId = memberUserId(row);
    return [
      {
        userId,
        displayName: memberProfile.displayName,
        avatarUrl: avatarUrl(memberProfile.avatarKey),
        isMe: userId === callerId,
      },
    ];
  });
}

export async function loadRoom(roomId: string, callerId: string): Promise<Room> {
  const [meta, memberRows] = await Promise.all([requireRoomMeta(roomId), loadMemberRows(roomId)]);
  return {
    id: roomId,
    code: meta.code,
    filters: meta.filters,
    // The value in force, not the stored one, which can sit above a shrunken room.
    matchThreshold: effectiveThreshold(meta, memberRows.length),
    requireMajority: meta.requireMajority,
    round: meta.round,
    members: await loadMembers(memberRows, callerId),
  };
}

/**
 * Moves the caller between rooms as one unit. The profile condition is what
 * makes a double join or double leave safe: only the call that saw the current
 * room can move the caller out of it.
 */
export function moveMemberWrites(
  userId: string,
  fromRoomId: string,
  toRoomId: string,
  now: string,
): TransactItems {
  const memberRow: MemberItem = { ...keys.member(toRoomId, userId), joinedAt: now };
  return [
    {
      Update: {
        TableName: tableName(),
        Key: keys.profile(userId),
        UpdateExpression: "SET roomId = :toRoomId",
        ConditionExpression: "roomId = :fromRoomId",
        ExpressionAttributeValues: { ":toRoomId": toRoomId, ":fromRoomId": fromRoomId },
      },
    },
    { Delete: { TableName: tableName(), Key: keys.member(fromRoomId, userId) } },
    { Put: { TableName: tableName(), Item: memberRow } },
  ];
}

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export function pageSize(limit: number | null | undefined): number {
  if (!limit || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(limit, MAX_PAGE_SIZE);
}
