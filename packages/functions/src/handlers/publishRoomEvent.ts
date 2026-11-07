import type { FieldArguments, RoomEventInput } from "@movie-date/core";
import type { ResolverContext } from "../lib/identity.js";

/**
 * sst.config.ts routes this field to a NONE data source, so a publish doesn't
 * spend an invocation. This keeps the same pass-through behaviour for anything
 * that does reach the Lambda; the resolver has already refused non-IAM callers.
 */
export async function publishRoomEvent(
  args: FieldArguments["publishRoomEvent"],
  _context: ResolverContext,
): Promise<RoomEventInput> {
  return args.input;
}
