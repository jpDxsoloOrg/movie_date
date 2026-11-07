import { resolveMediaType, type FieldArguments, type Room } from "@movie-date/core";
import { publishRoomEvent } from "../lib/events.js";
import { checkedFilters } from "../lib/filters.js";
import type { ResolverContext } from "../lib/identity.js";
import { getOrCreateProfile, loadRoom, updateRoomMeta } from "../lib/rooms.js";

export async function updateFilters(
  args: FieldArguments["updateFilters"],
  context: ResolverContext,
): Promise<Room> {
  const mediaType = resolveMediaType(args.mediaType);
  const filters = checkedFilters(args.filters, mediaType);
  const { roomId } = await getOrCreateProfile(context);
  await updateRoomMeta(roomId, {
    updateExpression: "SET #filters = :filters",
    names: { "#filters": mediaType === "TV" ? "tvFilters" : "filters" },
    values: { ":filters": filters },
    conditionExpression: "attribute_exists(pk)",
  });
  await publishRoomEvent({
    roomId,
    type: "ROOM_UPDATED",
    mediaType,
    actorId: context.userId,
  });
  return loadRoom(roomId, context.userId);
}
