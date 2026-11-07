import type { FieldArguments, Profile } from "@movie-date/core";
import type { ResolverContext } from "../lib/identity.js";
import { getOrCreateProfile, toProfile } from "../lib/rooms.js";

export async function me(
  _args: FieldArguments["me"],
  context: ResolverContext,
): Promise<Profile> {
  return toProfile(await getOrCreateProfile(context), context.userId);
}
