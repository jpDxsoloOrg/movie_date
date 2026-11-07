/**
 * Every operation the app sends. publishRoomEvent is left out on purpose: it is
 * IAM-only and the browser could never call it.
 */
import { graphql } from "../gql";
import type {
  FiltersInput,
  MeQuery as MeResult,
  OnRoomEventSubscription,
  RoomEventType,
  RoomFieldsFragment,
  HistoryEntryFieldsFragment,
  MatchFieldsFragment,
  MemberFieldsFragment,
  MovieFieldsFragment,
  PersonFieldsFragment,
  SwipeDirection,
  TypedDocumentString,
  WatchOptionsQuery as WatchOptionsResult,
  GenresQuery as GenresResult,
  DeckQuery as DeckResult,
} from "../gql/graphql";
import { getIdToken, signOut } from "./auth";
import { appConfig } from "./config";

export type Profile = MeResult["me"];
export type Room = RoomFieldsFragment;
export type Member = MemberFieldsFragment;
export type Movie = MovieFieldsFragment;
export type Person = PersonFieldsFragment;
export type Match = MatchFieldsFragment;
export type HistoryEntry = HistoryEntryFieldsFragment;
export type Genre = GenresResult["genres"][number];
export type WatchOption = WatchOptionsResult["watchOptions"][number];
export type DeckPage = DeckResult["deck"];
export type DeckCard = DeckPage["cards"][number];
export type RoomEvent = NonNullable<OnRoomEventSubscription["onRoomEvent"]>;
export type { FiltersInput, RoomEventType, SwipeDirection };

export type ApiErrorCode =
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "VALIDATION"
  | "CONFLICT"
  | "UNAUTHORIZED"
  | "UPSTREAM"
  | "NETWORK"
  | "UNKNOWN";

/** Keys are the `errorType`s AppSync reports: the backend's error codes plus its own auth failure. */
const CODE_BY_ERROR_TYPE: Partial<Record<string, ApiErrorCode>> = {
  NOT_FOUND: "NOT_FOUND",
  FORBIDDEN: "FORBIDDEN",
  VALIDATION: "VALIDATION",
  CONFLICT: "CONFLICT",
  UNAUTHORIZED: "UNAUTHORIZED",
  UPSTREAM: "UPSTREAM",
  UnauthorizedException: "UNAUTHORIZED",
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly errorType: string | undefined;

  constructor(message: string, code: ApiErrorCode, errorType?: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.errorType = errorType;
  }

  get isTransient(): boolean {
    return this.code === "NETWORK" || this.code === "UPSTREAM";
  }
}

const NETWORK_MESSAGE = "Can't reach the server. Check your connection and try again.";
const FALLBACK_MESSAGE = "Something went wrong. Please try again.";

/** What to show a person for anything a service threw. */
export function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : FALLBACK_MESSAGE;
}

interface GraphQLResponseError {
  message?: string;
  errorType?: string;
}

interface GraphQLResponse<TResult> {
  data?: TResult | null;
  errors?: GraphQLResponseError[] | null;
}

async function post(body: string, token: string): Promise<Response> {
  try {
    return await fetch(appConfig().graphqlUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body,
    });
  } catch {
    throw new ApiError(NETWORK_MESSAGE, "NETWORK");
  }
}

async function requireToken(forceRefresh: boolean): Promise<string> {
  const token = await getIdToken({ forceRefresh });
  if (!token) throw new ApiError("Please log in again.", "UNAUTHORIZED");
  return token;
}

export async function execute<TResult, TVariables>(
  document: TypedDocumentString<TResult, TVariables>,
  variables?: TVariables,
): Promise<TResult> {
  const body = JSON.stringify({ query: document.toString(), variables: variables ?? {} });

  let response = await post(body, await requireToken(false));
  if (response.status === 401) {
    // The stored token can look valid and still be refused: skewed clock, revoked session.
    response = await post(body, await requireToken(true));
    if (response.status === 401) {
      signOut();
      throw new ApiError("Please log in again.", "UNAUTHORIZED");
    }
  }

  if (response.status >= 500) throw new ApiError(NETWORK_MESSAGE, "NETWORK");

  let parsed: GraphQLResponse<TResult>;
  try {
    parsed = (await response.json()) as GraphQLResponse<TResult>;
  } catch {
    throw new ApiError(NETWORK_MESSAGE, "NETWORK");
  }

  const [first] = parsed.errors ?? [];
  if (first) {
    const code = first.errorType ? CODE_BY_ERROR_TYPE[first.errorType] : undefined;
    throw new ApiError(first.message ?? FALLBACK_MESSAGE, code ?? "UNKNOWN", first.errorType);
  }
  if (parsed.data === null || parsed.data === undefined) {
    throw new ApiError(FALLBACK_MESSAGE, "UNKNOWN");
  }
  return parsed.data;
}

// --- Fragments ---

export const PersonFields = graphql(`
  fragment PersonFields on Person {
    id
    name
    profileUrl
    knownForDepartment
  }
`);

export const MemberFields = graphql(`
  fragment MemberFields on Member {
    userId
    displayName
    avatarUrl
    isMe
  }
`);

export const RoomFields = graphql(`
  fragment RoomFields on Room {
    id
    code
    matchThreshold
    requireMajority
    round
    filters {
      genreIds
      services
      releaseDateGte
      releaseDateLte
      cast {
        ...PersonFields
      }
    }
    members {
      ...MemberFields
    }
  }
`);

export const MovieFields = graphql(`
  fragment MovieFields on Movie {
    id
    title
    overview
    releaseYear
    runtime
    voteAverage
    posterUrl
    backdropUrl
    genres
  }
`);

export const MatchFields = graphql(`
  fragment MatchFields on Match {
    id
    roomId
    round
    matchedAt
    movie {
      ...MovieFields
    }
  }
`);

export const HistoryEntryFields = graphql(`
  fragment HistoryEntryFields on HistoryEntry {
    direction
    round
    swipedAt
    movie {
      ...MovieFields
    }
  }
`);

// --- Queries ---

const MeQuery = graphql(`
  query Me {
    me {
      id
      email
      displayName
      avatarUrl
    }
  }
`);

const MyRoomQuery = graphql(`
  query MyRoom {
    myRoom {
      ...RoomFields
    }
  }
`);

const DeckQuery = graphql(`
  query Deck($page: Int!) {
    deck(page: $page) {
      nextPage
      cards {
        likedByRoommate
        movie {
          ...MovieFields
        }
      }
    }
  }
`);

const MovieQuery = graphql(`
  query Movie($id: Int!) {
    movie(id: $id) {
      ...MovieFields
    }
  }
`);

const TrailerQuery = graphql(`
  query Trailer($movieId: Int!) {
    trailer(movieId: $movieId)
  }
`);

const WatchOptionsQuery = graphql(`
  query WatchOptions($movieId: Int!) {
    watchOptions(movieId: $movieId) {
      serviceId
      serviceName
      type
      link
      logoUrl
    }
  }
`);

const GenresQuery = graphql(`
  query Genres {
    genres {
      id
      name
    }
  }
`);

const SearchPeopleQuery = graphql(`
  query SearchPeople($query: String!) {
    searchPeople(query: $query) {
      ...PersonFields
    }
  }
`);

const MatchesQuery = graphql(`
  query Matches($limit: Int, $nextToken: String) {
    matches(limit: $limit, nextToken: $nextToken) {
      nextToken
      matches {
        ...MatchFields
      }
    }
  }
`);

const SwipeHistoryQuery = graphql(`
  query SwipeHistory($limit: Int, $nextToken: String) {
    swipeHistory(limit: $limit, nextToken: $nextToken) {
      nextToken
      entries {
        ...HistoryEntryFields
      }
    }
  }
`);

const PendingMatchQuery = graphql(`
  query PendingMatch {
    pendingMatch {
      ...MatchFields
    }
  }
`);

// --- Mutations ---

const SwipeMutation = graphql(`
  mutation Swipe($movieId: Int!, $direction: SwipeDirection!) {
    swipe(movieId: $movieId, direction: $direction) {
      movieId
      direction
      match {
        ...MatchFields
      }
    }
  }
`);

const UndoSwipeMutation = graphql(`
  mutation UndoSwipe($movieId: Int!) {
    undoSwipe(movieId: $movieId) {
      movieId
      undone
    }
  }
`);

const UpdateFiltersMutation = graphql(`
  mutation UpdateFilters($filters: FiltersInput!) {
    updateFilters(filters: $filters) {
      ...RoomFields
    }
  }
`);

const UpdateRoomSettingsMutation = graphql(`
  mutation UpdateRoomSettings($matchThreshold: Int!, $requireMajority: Boolean!) {
    updateRoomSettings(matchThreshold: $matchThreshold, requireMajority: $requireMajority) {
      ...RoomFields
    }
  }
`);

const JoinRoomMutation = graphql(`
  mutation JoinRoom($code: String!) {
    joinRoom(code: $code) {
      ...RoomFields
    }
  }
`);

const LeaveRoomMutation = graphql(`
  mutation LeaveRoom {
    leaveRoom {
      ...RoomFields
    }
  }
`);

const StartNewRoundMutation = graphql(`
  mutation StartNewRound($expectedRound: Int!) {
    startNewRound(expectedRound: $expectedRound) {
      ...RoomFields
    }
  }
`);

const UpdateProfileMutation = graphql(`
  mutation UpdateProfile($displayName: String, $avatarKey: String) {
    updateProfile(displayName: $displayName, avatarKey: $avatarKey) {
      id
      email
      displayName
      avatarUrl
    }
  }
`);

const CreateAvatarUploadMutation = graphql(`
  mutation CreateAvatarUpload($contentType: String!) {
    createAvatarUpload(contentType: $contentType) {
      url
      fields
      key
    }
  }
`);

/** Selects every RoomEvent field, as the backend's publish does. */
export const OnRoomEventDocument = graphql(`
  subscription OnRoomEvent($roomId: ID!) {
    onRoomEvent(roomId: $roomId) {
      roomId
      type
      movieId
      matchId
      round
      actorId
    }
  }
`);

export interface PageRequest {
  limit?: number;
  nextToken?: string | null;
}

export type AvatarContentType = "image/jpeg" | "image/png" | "image/webp";

/** AWSJSON arrives as a string, and may be double-encoded depending on how the resolver returns it. */
function parseUploadFields(raw: string): Record<string, string> {
  const parsed: unknown = JSON.parse(raw);
  return (typeof parsed === "string" ? JSON.parse(parsed) : parsed) as Record<string, string>;
}

const MATCH_LOOKUP_PAGE_SIZE = 50;

export const api = {
  me: async () => (await execute(MeQuery)).me,
  myRoom: async () => (await execute(MyRoomQuery)).myRoom,
  deck: async (page: number) => (await execute(DeckQuery, { page })).deck,
  movie: async (id: number) => (await execute(MovieQuery, { id })).movie,
  trailer: async (movieId: number) => (await execute(TrailerQuery, { movieId })).trailer ?? null,
  watchOptions: async (movieId: number) => (await execute(WatchOptionsQuery, { movieId })).watchOptions,
  genres: async () => (await execute(GenresQuery)).genres,
  searchPeople: async (query: string) => (await execute(SearchPeopleQuery, { query })).searchPeople,
  matches: async (page: PageRequest = {}) => (await execute(MatchesQuery, page)).matches,
  swipeHistory: async (page: PageRequest = {}) => (await execute(SwipeHistoryQuery, page)).swipeHistory,
  pendingMatch: async () => (await execute(PendingMatchQuery)).pendingMatch ?? null,

  swipe: async (movieId: number, direction: SwipeDirection) =>
    (await execute(SwipeMutation, { movieId, direction })).swipe,
  undoSwipe: async (movieId: number) => (await execute(UndoSwipeMutation, { movieId })).undoSwipe,
  updateFilters: async (filters: FiltersInput) =>
    (await execute(UpdateFiltersMutation, { filters })).updateFilters,
  updateRoomSettings: async (matchThreshold: number, requireMajority: boolean) =>
    (await execute(UpdateRoomSettingsMutation, { matchThreshold, requireMajority })).updateRoomSettings,
  joinRoom: async (code: string) => (await execute(JoinRoomMutation, { code })).joinRoom,
  leaveRoom: async () => (await execute(LeaveRoomMutation)).leaveRoom,
  startNewRound: async (expectedRound: number) =>
    (await execute(StartNewRoundMutation, { expectedRound })).startNewRound,
  updateProfile: async (changes: { displayName?: string; avatarKey?: string }) =>
    (await execute(UpdateProfileMutation, changes)).updateProfile,

  createAvatarUpload: async (contentType: AvatarContentType) => {
    const { createAvatarUpload: upload } = await execute(CreateAvatarUploadMutation, { contentType });
    return { url: upload.url, key: upload.key, fields: parseUploadFields(upload.fields) };
  },

  /**
   * Posts an already cropped image to S3 and returns the key for updateProfile.
   * S3 ignores every form field after `file`, so it must go last.
   */
  uploadAvatar: async (image: Blob, contentType: AvatarContentType): Promise<string> => {
    const { url, key, fields } = await api.createAvatarUpload(contentType);
    const form = new FormData();
    for (const [name, value] of Object.entries(fields)) form.append(name, value);
    form.append("file", image);
    let response: Response;
    try {
      response = await fetch(url, { method: "POST", body: form });
    } catch {
      throw new ApiError(NETWORK_MESSAGE, "NETWORK");
    }
    if (!response.ok) throw new ApiError("That image couldn't be uploaded.", "UNKNOWN");
    return key;
  },

  /**
   * The schema has no match-by-id query, so a reload of /match/:id finds it here:
   * pendingMatch covers the usual case, the history covers an older one.
   */
  findMatch: async (matchId: string): Promise<Match | null> => {
    const pending = await api.pendingMatch();
    if (pending?.id === matchId) return pending;
    let nextToken: string | null | undefined;
    do {
      const page = await api.matches({ limit: MATCH_LOOKUP_PAGE_SIZE, nextToken });
      const found = page.matches.find((match) => match.id === matchId);
      if (found) return found;
      nextToken = page.nextToken;
    } while (nextToken);
    return null;
  },
};
