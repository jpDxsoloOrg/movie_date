import type { FieldArguments, Room } from "@movie-date/core";
import { publishRoomEvent } from "../lib/events.js";
import { checkedFilters } from "../lib/filters.js";
import type { ResolverContext } from "../lib/identity.js";
import { getOrCreateProfile, loadRoom, updateRoomMeta } from "../lib/rooms.js";

export async function updateFilters(
  args: FieldArguments["updateFilters"],
  context: ResolverContext,
): Promise<Room> {
  const filters = checkedFilters(args.filters);
  const { roomId } = await getOrCreateProfile(context);
  await updateRoomMeta(roomId, {
    updateExpression: "SET #filters = :filters",
    names: { "#filters": "filters" },
    values: { ":filters": filters },
    conditionExpression: "attribute_exists(pk)",
  });
  await publishRoomEvent({ roomId, type: "ROOM_UPDATED", actorId: context.userId });
  return loadRoom(roomId, context.userId);
}
