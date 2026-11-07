import { resolveMediaType, type FieldArguments } from "@movie-date/core";
import { markHistoryCleared } from "../lib/history.js";
import type { ResolverContext } from "../lib/identity.js";
import { getOrCreateProfile } from "../lib/rooms.js";

export async function clearHistory(
  args: FieldArguments["clearHistory"],
  context: ResolverContext,
): Promise<boolean> {
  const { roomId } = await getOrCreateProfile(context);
  await markHistoryCleared(roomId, context.userId, args.kind, resolveMediaType(args.mediaType));
  return true;
}
