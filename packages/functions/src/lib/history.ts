import type { HistoryKind, MediaType } from "@movie-date/core";
import { getItem, updateItem } from "./db.js";
import * as keys from "./keys.js";
import type { MemberItem } from "./rooms.js";

const MAX_SEARCH_LENGTH = 100;

/** A flat attribute per list, on the member row, so leaving the room forgets it. */
function clearedAttribute(kind: HistoryKind, mediaType: MediaType): string {
  return `historyClearedAt${kind}${mediaType}`;
}

/**
 * The time a list starts from for this member. Matches also start when they joined,
 * so someone invited in can't read what the room matched before they arrived.
 */
export async function historyStart(
  roomId: string,
  userId: string,
  kind: HistoryKind,
  mediaType: MediaType,
  ignoreCleared = false,
): Promise<string> {
  const member = await getItem<MemberItem>(keys.member(roomId, userId), { consistent: true });
  const cleared = member?.[clearedAttribute(kind, mediaType)];
  const clearedAt = typeof cleared === "string" && !ignoreCleared ? cleared : "";
  const joinedAt = kind === "MATCHES" ? (member?.joinedAt ?? "") : "";
  return clearedAt > joinedAt ? clearedAt : joinedAt;
}

export async function markHistoryCleared(
  roomId: string,
  userId: string,
  kind: HistoryKind,
  mediaType: MediaType,
): Promise<void> {
  await updateItem(keys.member(roomId, userId), {
    updateExpression: "SET #cleared = :now",
    names: { "#cleared": clearedAttribute(kind, mediaType) },
    values: { ":now": new Date().toISOString() },
    conditionExpression: "attribute_exists(pk)",
  });
}

function folded(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
}

/** Case and accents don't count, so "amelie" finds Amélie. */
export function titleMatcher(search: string | null | undefined): (title: string) => boolean {
  const wanted = folded((search ?? "").trim().slice(0, MAX_SEARCH_LENGTH));
  return (title) => folded(title).includes(wanted);
}
