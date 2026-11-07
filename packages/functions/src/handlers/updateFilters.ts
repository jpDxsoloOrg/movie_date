import { isServiceKey, type FieldArguments, type Filters, type Room } from "@movie-date/core";
import { ValidationError } from "../lib/errors.js";
import { publishRoomEvent } from "../lib/events.js";
import type { ResolverContext } from "../lib/identity.js";
import { getOrCreateProfile, loadRoom, updateRoomMeta } from "../lib/rooms.js";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function checkedDate(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  if (!DATE_PATTERN.test(value) || Number.isNaN(Date.parse(value))) {
    throw new ValidationError("Dates must be in YYYY-MM-DD format.");
  }
  return value;
}

function checkedFilters(filters: Filters): Filters {
  if (!filters.services.every(isServiceKey)) {
    throw new ValidationError("Unknown streaming service.");
  }
  const releaseDateGte = checkedDate(filters.releaseDateGte);
  const releaseDateLte = checkedDate(filters.releaseDateLte);
  return {
    genreIds: filters.genreIds,
    cast: filters.cast,
    services: filters.services,
    ...(releaseDateGte ? { releaseDateGte } : {}),
    ...(releaseDateLte ? { releaseDateLte } : {}),
  };
}

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
