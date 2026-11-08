import { me } from "./handlers/me.js";
import { myRoom } from "./handlers/myRoom.js";
import { deck } from "./handlers/deck.js";
import { movie } from "./handlers/movie.js";
import { trailer } from "./handlers/trailer.js";
import { watchOptions } from "./handlers/watchOptions.js";
import { genres } from "./handlers/genres.js";
import { searchPeople } from "./handlers/searchPeople.js";
import { matches } from "./handlers/matches.js";
import { swipeHistory } from "./handlers/swipeHistory.js";
import { pendingMatch } from "./handlers/pendingMatch.js";
import { swipe } from "./handlers/swipe.js";
import { undoSwipe } from "./handlers/undoSwipe.js";
import { updateFilters } from "./handlers/updateFilters.js";
import { updateRoomSettings } from "./handlers/updateRoomSettings.js";
import { joinRoom } from "./handlers/joinRoom.js";
import { leaveRoom } from "./handlers/leaveRoom.js";
import { startNewRound } from "./handlers/startNewRound.js";
import { updateProfile } from "./handlers/updateProfile.js";
import { createAvatarUpload } from "./handlers/createAvatarUpload.js";
import { filterPreview } from "./handlers/filterPreview.js";
import { clearHistory } from "./handlers/clearHistory.js";
import { resetSwipes } from "./handlers/resetSwipes.js";
import { clearMatch } from "./handlers/clearMatch.js";
import { plexStatus } from "./handlers/plexStatus.js";
import { startPlexLink } from "./handlers/startPlexLink.js";
import { confirmPlexLink } from "./handlers/confirmPlexLink.js";
import { unlinkPlex } from "./handlers/unlinkPlex.js";
import { requestOnPlex } from "./handlers/requestOnPlex.js";
import { publishRoomEvent } from "./handlers/publishRoomEvent.js";
import { revokeRoomSubscriptions } from "./handlers/revokeRoomSubscriptions.js";
import { onRoomEvent } from "./handlers/onRoomEvent.js";
import type { FieldArguments, FieldName } from "@movie-date/core";
import type { AppSyncResolverEvent } from "aws-lambda";
import { ForbiddenError, toClientError } from "./lib/errors.js";
import {
  isIamIdentity,
  SYSTEM_USER_ID,
  userContext,
  type ResolverContext,
  type ResolverHandler,
} from "./lib/identity.js";

type HandlerTable = { [Field in FieldName]: ResolverHandler<FieldArguments[Field]> };

/** One entry per Query, Mutation and Subscription field in graphql/schema.graphql. */
const handlers: HandlerTable = {
  me,
  myRoom,
  deck,
  filterPreview,
  movie,
  trailer,
  watchOptions,
  plexStatus,
  genres,
  searchPeople,
  matches,
  swipeHistory,
  pendingMatch,
  swipe,
  undoSwipe,
  updateFilters,
  updateRoomSettings,
  joinRoom,
  leaveRoom,
  startNewRound,
  updateProfile,
  createAvatarUpload,
  startPlexLink,
  confirmPlexLink,
  unlinkPlex,
  requestOnPlex,
  clearMatch,
  clearHistory,
  resetSwipes,
  publishRoomEvent,
  revokeRoomSubscriptions,
  onRoomEvent,
};

/** The fields the backend calls itself. Everything else belongs to a signed-in user. */
const IAM_FIELDS: readonly string[] = ["publishRoomEvent", "revokeRoomSubscriptions"] satisfies FieldName[];

function contextFor(field: string, event: AppSyncResolverEvent<unknown>): ResolverContext {
  if (!IAM_FIELDS.includes(field)) return userContext(event.identity);
  if (!isIamIdentity(event.identity)) throw new ForbiddenError();
  return { userId: SYSTEM_USER_ID };
}

export async function handler(event: AppSyncResolverEvent<unknown>): Promise<unknown> {
  const field = event.info.fieldName;
  try {
    // `never` because the table's argument types differ per field; AppSync has
    // already validated the arguments against the schema.
    const resolve = handlers[field as FieldName] as ResolverHandler<never> | undefined;
    if (!resolve) throw new Error(`No handler for field: ${field}`);
    return await resolve(event.arguments as never, contextFor(field, event));
  } catch (error) {
    console.error(`Resolver ${field} failed`, error);
    throw toClientError(error);
  }
}
