import type { FieldArguments, Room } from "@movie-date/core";
import type { ResolverContext } from "../lib/identity.js";
import { getOrCreateProfile, loadRoom } from "../lib/rooms.js";

export async function myRoom(
  _args: FieldArguments["myRoom"],
  context: ResolverContext,
): Promise<Room> {
  const profile = await getOrCreateProfile(context);
  return loadRoom(profile.roomId, context.userId);
}
