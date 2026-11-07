/* eslint-disable */
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
export type Maybe<T> = T | null;
export type InputMaybe<T> = Maybe<T>;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  AWSDateTime: { input: string; output: string; }
  AWSJSON: { input: string; output: string; }
};

export type AvatarUpload = {
  /** JSON object of form fields to send before the file. */
  fields: Scalars['AWSJSON']['output'];
  /** Pass to updateProfile once the upload succeeds. */
  key: Scalars['String']['output'];
  /** POST target for the browser's multipart upload. */
  url: Scalars['String']['output'];
};

export type DeckCard = {
  /** True if another room member already liked it this round; these sort first. */
  likedByRoommate: Scalars['Boolean']['output'];
  movie: Movie;
};

export type DeckPage = {
  cards: Array<DeckCard>;
  /** Pass to deck() for more. Null when TMDB has nothing further. */
  nextPage?: Maybe<Scalars['Int']['output']>;
};

/** What a set of filters would deal, before they are saved. */
export type FilterPreview = {
  /** The first few matching posters, for a preview strip. */
  posterUrls: Array<Scalars['String']['output']>;
  /** About how many titles match. Null when no count is available. */
  totalResults?: Maybe<Scalars['Int']['output']>;
};

export type Filters = {
  cast: Array<Person>;
  genreIds: Array<Scalars['Int']['output']>;
  /** YYYY-MM-DD */
  releaseDateGte?: Maybe<Scalars['String']['output']>;
  /** YYYY-MM-DD */
  releaseDateLte?: Maybe<Scalars['String']['output']>;
  /** Keys from the provider catalogue, e.g. netflix. Empty means any service. plex is ignored unless Room.plexAvailable. */
  services: Array<Scalars['String']['output']>;
};

export type FiltersInput = {
  cast: Array<PersonInput>;
  genreIds: Array<Scalars['Int']['input']>;
  releaseDateGte?: InputMaybe<Scalars['String']['input']>;
  releaseDateLte?: InputMaybe<Scalars['String']['input']>;
  services: Array<Scalars['String']['input']>;
};

export type Genre = {
  id: Scalars['Int']['output'];
  name: Scalars['String']['output'];
};

export type HistoryEntry = {
  direction: SwipeDirection;
  movie: Movie;
  round: Scalars['Int']['output'];
  swipedAt: Scalars['AWSDateTime']['output'];
};

export type HistoryPage = {
  entries: Array<HistoryEntry>;
  nextToken?: Maybe<Scalars['String']['output']>;
};

export type Match = {
  id: Scalars['ID']['output'];
  matchedAt: Scalars['AWSDateTime']['output'];
  movie: Movie;
  roomId: Scalars['ID']['output'];
  round: Scalars['Int']['output'];
};

export type MatchPage = {
  matches: Array<Match>;
  nextToken?: Maybe<Scalars['String']['output']>;
};

/** TMDB numbers movies and shows separately, so an id alone can't identify a title. */
export type MediaType =
  | 'MOVIE'
  | 'TV';

/** What other room members may see. Never includes an email. */
export type Member = {
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  isMe: Scalars['Boolean']['output'];
  userId: Scalars['ID']['output'];
};

export type Movie = {
  backdropUrl?: Maybe<Scalars['String']['output']>;
  genres: Array<Scalars['String']['output']>;
  id: Scalars['Int']['output'];
  overview: Scalars['String']['output'];
  posterUrl?: Maybe<Scalars['String']['output']>;
  releaseYear?: Maybe<Scalars['Int']['output']>;
  runtime?: Maybe<Scalars['Int']['output']>;
  title: Scalars['String']['output'];
  voteAverage?: Maybe<Scalars['Float']['output']>;
};

export type Mutation = {
  confirmPlexLink: Profile;
  createAvatarUpload: AvatarUpload;
  /** Case-insensitive. Leaves the caller's current room first. */
  joinRoom: Room;
  /** Leaves the current room and puts the caller in a new one of their own. */
  leaveRoom: Room;
  /** Backend only. Pass-through that fans out to onRoomEvent subscribers. */
  publishRoomEvent: RoomEvent;
  /** Acts only as the caller's linked account. A duplicate comes back as REQUESTED. */
  requestOnPlex: PlexStatus;
  /** Backend only. Closes a departed member's open onRoomEvent subscriptions to that room. */
  revokeRoomSubscriptions?: Maybe<Scalars['Boolean']['output']>;
  /** Back to Start. expectedRound makes a double press from two members a no-op. */
  startNewRound: Room;
  /** Emails a code to the caller's own profile address if it has a Plex Request account. */
  startPlexLink: PlexLinkStart;
  swipe: SwipeResult;
  undoSwipe: UndoResult;
  unlinkPlex: Profile;
  updateFilters: Room;
  updateProfile: Profile;
  updateRoomSettings: Room;
};


export type MutationConfirmPlexLinkArgs = {
  code: Scalars['String']['input'];
};


export type MutationCreateAvatarUploadArgs = {
  contentType: Scalars['String']['input'];
};


export type MutationJoinRoomArgs = {
  code: Scalars['String']['input'];
};


export type MutationPublishRoomEventArgs = {
  input: RoomEventInput;
};


export type MutationRequestOnPlexArgs = {
  movieId: Scalars['Int']['input'];
};


export type MutationRevokeRoomSubscriptionsArgs = {
  roomId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationStartNewRoundArgs = {
  expectedRound: Scalars['Int']['input'];
};


export type MutationSwipeArgs = {
  direction: SwipeDirection;
  movieId: Scalars['Int']['input'];
};


export type MutationUndoSwipeArgs = {
  movieId: Scalars['Int']['input'];
};


export type MutationUpdateFiltersArgs = {
  filters: FiltersInput;
};


export type MutationUpdateProfileArgs = {
  avatarKey?: InputMaybe<Scalars['String']['input']>;
  displayName?: InputMaybe<Scalars['String']['input']>;
};


export type MutationUpdateRoomSettingsArgs = {
  matchThreshold: Scalars['Int']['input'];
  requireMajority: Scalars['Boolean']['input'];
};

export type Person = {
  id: Scalars['Int']['output'];
  knownForDepartment?: Maybe<Scalars['String']['output']>;
  name: Scalars['String']['output'];
  profileUrl?: Maybe<Scalars['String']['output']>;
};

export type PersonInput = {
  id: Scalars['Int']['input'];
  knownForDepartment?: InputMaybe<Scalars['String']['input']>;
  name: Scalars['String']['input'];
  profileUrl?: InputMaybe<Scalars['String']['input']>;
};

export type PlexAvailability =
  /** In the library with a file. */
  | 'AVAILABLE'
  /** In the library, waiting on a file. */
  | 'MONITORED'
  | 'NOT_IN_LIBRARY'
  /** An active request exists. */
  | 'REQUESTED';

export type PlexLinkStart = {
  /** Always true, so this can't be used to discover who has a Plex Request account. */
  sent: Scalars['Boolean']['output'];
};

export type PlexStatus = {
  availability: PlexAvailability;
  canRequest: Scalars['Boolean']['output'];
};

export type Profile = {
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  plexLinked: Scalars['Boolean']['output'];
};

export type Query = {
  /** Unswiped movies for the caller. page starts at 1. */
  deck: DeckPage;
  /** Takes draft filters because deck() only reads the saved ones. Call it debounced. */
  filterPreview: FilterPreview;
  genres: Array<Genre>;
  /** Matches in the caller's room, newest first, across all rounds. */
  matches: MatchPage;
  /** Creates the profile and a first room on first call, so sign-up needs no extra step. */
  me: Profile;
  movie: Movie;
  /** The caller's current room. */
  myRoom: Room;
  /** A match the current round already has, for clients that were offline when it happened. */
  pendingMatch?: Maybe<Match>;
  /** Null when the caller hasn't linked Plex Request. */
  plexStatus?: Maybe<PlexStatus>;
  searchPeople: Array<Person>;
  /** The caller's own swipes in the current room, newest first. */
  swipeHistory: HistoryPage;
  /** YouTube id of the best trailer, or null. */
  trailer?: Maybe<Scalars['String']['output']>;
  watchOptions: Array<WatchOption>;
};


export type QueryDeckArgs = {
  page: Scalars['Int']['input'];
};


export type QueryFilterPreviewArgs = {
  filters: FiltersInput;
};


export type QueryMatchesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  nextToken?: InputMaybe<Scalars['String']['input']>;
};


export type QueryMovieArgs = {
  id: Scalars['Int']['input'];
};


export type QueryPlexStatusArgs = {
  movieId: Scalars['Int']['input'];
};


export type QuerySearchPeopleArgs = {
  query: Scalars['String']['input'];
};


export type QuerySwipeHistoryArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  nextToken?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTrailerArgs = {
  movieId: Scalars['Int']['input'];
};


export type QueryWatchOptionsArgs = {
  movieId: Scalars['Int']['input'];
};

export type Room = {
  code: Scalars['String']['output'];
  filters: Filters;
  id: Scalars['ID']['output'];
  matchThreshold: Scalars['Int']['output'];
  members: Array<Member>;
  /** True when any member has linked Plex Request. Unlocks the plex filter for the whole room. */
  plexAvailable: Scalars['Boolean']['output'];
  requireMajority: Scalars['Boolean']['output'];
  /** Increments on Back to Start. Swipes and tallies belong to one round. */
  round: Scalars['Int']['output'];
};

export type RoomEvent = {
  /** Who caused it, so a client can ignore its own echo. */
  actorId?: Maybe<Scalars['ID']['output']>;
  matchId?: Maybe<Scalars['ID']['output']>;
  movieId?: Maybe<Scalars['Int']['output']>;
  roomId: Scalars['ID']['output'];
  round?: Maybe<Scalars['Int']['output']>;
  type: RoomEventType;
};

export type RoomEventInput = {
  actorId?: InputMaybe<Scalars['ID']['input']>;
  matchId?: InputMaybe<Scalars['ID']['input']>;
  movieId?: InputMaybe<Scalars['Int']['input']>;
  roomId: Scalars['ID']['input'];
  round?: InputMaybe<Scalars['Int']['input']>;
  type: RoomEventType;
};

export type RoomEventType =
  /** A swipe completed a match. movieId and matchId are set. */
  | 'MATCH_FOUND'
  /** Someone joined or left. Clients reload the member list. */
  | 'MEMBERS_CHANGED'
  /** Filters or match threshold changed. Clients reload the deck/room. */
  | 'ROOM_UPDATED'
  /** Back to Start was pressed. round is the new round; clients restart the deck. */
  | 'ROUND_RESET';

export type Subscription = {
  /** A resolver rejects the subscription unless the caller is a member of roomId. */
  onRoomEvent?: Maybe<RoomEvent>;
};


export type SubscriptionOnRoomEventArgs = {
  roomId: Scalars['ID']['input'];
};

export type SwipeDirection =
  | 'LIKE'
  | 'PASS';

export type SwipeResult = {
  direction: SwipeDirection;
  /** Set when this swipe completed a match, so the swiper doesn't wait on the subscription. */
  match?: Maybe<Match>;
  movieId: Scalars['Int']['output'];
};

export type UndoResult = {
  movieId: Scalars['Int']['output'];
  /** False when there was nothing to undo or the movie already matched. */
  undone: Scalars['Boolean']['output'];
};

export type WatchOption = {
  /** Deep link to the title when the provider gives one. */
  link?: Maybe<Scalars['String']['output']>;
  /** Provider logo URL for services outside the bundled icon set. */
  logoUrl?: Maybe<Scalars['String']['output']>;
  serviceId: Scalars['String']['output'];
  serviceName: Scalars['String']['output'];
  /** subscription, free, rent, buy, addon or library. library is the room's Plex, which has no link. */
  type: Scalars['String']['output'];
};

export type ProfileFieldsFragment = { id: string, email: string, displayName: string, avatarUrl?: string | null, plexLinked: boolean };

export type PlexStatusFieldsFragment = { availability: PlexAvailability, canRequest: boolean };

export type PersonFieldsFragment = { id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null };

export type MemberFieldsFragment = { userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean };

export type RoomFieldsFragment = { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> };

export type MovieFieldsFragment = { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> };

export type MatchFieldsFragment = { id: string, roomId: string, round: number, matchedAt: string, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } };

export type HistoryEntryFieldsFragment = { direction: SwipeDirection, round: number, swipedAt: string, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { me: { id: string, email: string, displayName: string, avatarUrl?: string | null, plexLinked: boolean } };

export type MyRoomQueryVariables = Exact<{ [key: string]: never; }>;


export type MyRoomQuery = { myRoom: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

export type DeckQueryVariables = Exact<{
  page: Scalars['Int']['input'];
}>;


export type DeckQuery = { deck: { nextPage?: number | null, cards: Array<{ likedByRoommate: boolean, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } }> } };

export type FilterPreviewQueryVariables = Exact<{
  filters: FiltersInput;
}>;


export type FilterPreviewQuery = { filterPreview: { totalResults?: number | null, posterUrls: Array<string> } };

export type MovieQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type MovieQuery = { movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } };

export type TrailerQueryVariables = Exact<{
  movieId: Scalars['Int']['input'];
}>;


export type TrailerQuery = { trailer?: string | null };

export type WatchOptionsQueryVariables = Exact<{
  movieId: Scalars['Int']['input'];
}>;


export type WatchOptionsQuery = { watchOptions: Array<{ serviceId: string, serviceName: string, type: string, link?: string | null, logoUrl?: string | null }> };

export type PlexStatusQueryVariables = Exact<{
  movieId: Scalars['Int']['input'];
}>;


export type PlexStatusQuery = { plexStatus?: { availability: PlexAvailability, canRequest: boolean } | null };

export type GenresQueryVariables = Exact<{ [key: string]: never; }>;


export type GenresQuery = { genres: Array<{ id: number, name: string }> };

export type SearchPeopleQueryVariables = Exact<{
  query: Scalars['String']['input'];
}>;


export type SearchPeopleQuery = { searchPeople: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> };

export type MatchesQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  nextToken?: InputMaybe<Scalars['String']['input']>;
}>;


export type MatchesQuery = { matches: { nextToken?: string | null, matches: Array<{ id: string, roomId: string, round: number, matchedAt: string, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } }> } };

export type SwipeHistoryQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  nextToken?: InputMaybe<Scalars['String']['input']>;
}>;


export type SwipeHistoryQuery = { swipeHistory: { nextToken?: string | null, entries: Array<{ direction: SwipeDirection, round: number, swipedAt: string, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } }> } };

export type PendingMatchQueryVariables = Exact<{ [key: string]: never; }>;


export type PendingMatchQuery = { pendingMatch?: { id: string, roomId: string, round: number, matchedAt: string, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } } | null };

export type SwipeMutationVariables = Exact<{
  movieId: Scalars['Int']['input'];
  direction: SwipeDirection;
}>;


export type SwipeMutation = { swipe: { movieId: number, direction: SwipeDirection, match?: { id: string, roomId: string, round: number, matchedAt: string, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } } | null } };

export type UndoSwipeMutationVariables = Exact<{
  movieId: Scalars['Int']['input'];
}>;


export type UndoSwipeMutation = { undoSwipe: { movieId: number, undone: boolean } };

export type UpdateFiltersMutationVariables = Exact<{
  filters: FiltersInput;
}>;


export type UpdateFiltersMutation = { updateFilters: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

export type UpdateRoomSettingsMutationVariables = Exact<{
  matchThreshold: Scalars['Int']['input'];
  requireMajority: Scalars['Boolean']['input'];
}>;


export type UpdateRoomSettingsMutation = { updateRoomSettings: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

export type JoinRoomMutationVariables = Exact<{
  code: Scalars['String']['input'];
}>;


export type JoinRoomMutation = { joinRoom: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

export type LeaveRoomMutationVariables = Exact<{ [key: string]: never; }>;


export type LeaveRoomMutation = { leaveRoom: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

export type StartNewRoundMutationVariables = Exact<{
  expectedRound: Scalars['Int']['input'];
}>;


export type StartNewRoundMutation = { startNewRound: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

export type UpdateProfileMutationVariables = Exact<{
  displayName?: InputMaybe<Scalars['String']['input']>;
  avatarKey?: InputMaybe<Scalars['String']['input']>;
}>;


export type UpdateProfileMutation = { updateProfile: { id: string, email: string, displayName: string, avatarUrl?: string | null, plexLinked: boolean } };

export type CreateAvatarUploadMutationVariables = Exact<{
  contentType: Scalars['String']['input'];
}>;


export type CreateAvatarUploadMutation = { createAvatarUpload: { url: string, fields: string, key: string } };

export type StartPlexLinkMutationVariables = Exact<{ [key: string]: never; }>;


export type StartPlexLinkMutation = { startPlexLink: { sent: boolean } };

export type ConfirmPlexLinkMutationVariables = Exact<{
  code: Scalars['String']['input'];
}>;


export type ConfirmPlexLinkMutation = { confirmPlexLink: { id: string, email: string, displayName: string, avatarUrl?: string | null, plexLinked: boolean } };

export type UnlinkPlexMutationVariables = Exact<{ [key: string]: never; }>;


export type UnlinkPlexMutation = { unlinkPlex: { id: string, email: string, displayName: string, avatarUrl?: string | null, plexLinked: boolean } };

export type RequestOnPlexMutationVariables = Exact<{
  movieId: Scalars['Int']['input'];
}>;


export type RequestOnPlexMutation = { requestOnPlex: { availability: PlexAvailability, canRequest: boolean } };

export type OnRoomEventSubscriptionVariables = Exact<{
  roomId: Scalars['ID']['input'];
}>;


export type OnRoomEventSubscription = { onRoomEvent?: { roomId: string, type: RoomEventType, movieId?: number | null, matchId?: string | null, round?: number | null, actorId?: string | null } | null };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, unknown> | undefined;

  constructor(value: string, __meta__?: Record<string, unknown> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const ProfileFieldsFragmentDoc = new TypedDocumentString(`
    fragment ProfileFields on Profile {
  id
  email
  displayName
  avatarUrl
  plexLinked
}
    `, {"fragmentName":"ProfileFields"}) as unknown as TypedDocumentString<ProfileFieldsFragment, unknown>;
export const PlexStatusFieldsFragmentDoc = new TypedDocumentString(`
    fragment PlexStatusFields on PlexStatus {
  availability
  canRequest
}
    `, {"fragmentName":"PlexStatusFields"}) as unknown as TypedDocumentString<PlexStatusFieldsFragment, unknown>;
export const PersonFieldsFragmentDoc = new TypedDocumentString(`
    fragment PersonFields on Person {
  id
  name
  profileUrl
  knownForDepartment
}
    `, {"fragmentName":"PersonFields"}) as unknown as TypedDocumentString<PersonFieldsFragment, unknown>;
export const MemberFieldsFragmentDoc = new TypedDocumentString(`
    fragment MemberFields on Member {
  userId
  displayName
  avatarUrl
  isMe
}
    `, {"fragmentName":"MemberFields"}) as unknown as TypedDocumentString<MemberFieldsFragment, unknown>;
export const RoomFieldsFragmentDoc = new TypedDocumentString(`
    fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  plexAvailable
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
    fragment PersonFields on Person {
  id
  name
  profileUrl
  knownForDepartment
}
fragment MemberFields on Member {
  userId
  displayName
  avatarUrl
  isMe
}`, {"fragmentName":"RoomFields"}) as unknown as TypedDocumentString<RoomFieldsFragment, unknown>;
export const MovieFieldsFragmentDoc = new TypedDocumentString(`
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
    `, {"fragmentName":"MovieFields"}) as unknown as TypedDocumentString<MovieFieldsFragment, unknown>;
export const MatchFieldsFragmentDoc = new TypedDocumentString(`
    fragment MatchFields on Match {
  id
  roomId
  round
  matchedAt
  movie {
    ...MovieFields
  }
}
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
}`, {"fragmentName":"MatchFields"}) as unknown as TypedDocumentString<MatchFieldsFragment, unknown>;
export const HistoryEntryFieldsFragmentDoc = new TypedDocumentString(`
    fragment HistoryEntryFields on HistoryEntry {
  direction
  round
  swipedAt
  movie {
    ...MovieFields
  }
}
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
}`, {"fragmentName":"HistoryEntryFields"}) as unknown as TypedDocumentString<HistoryEntryFieldsFragment, unknown>;
export const MeDocument = new TypedDocumentString(`
    query Me {
  me {
    ...ProfileFields
  }
}
    fragment ProfileFields on Profile {
  id
  email
  displayName
  avatarUrl
  plexLinked
}`) as unknown as TypedDocumentString<MeQuery, MeQueryVariables>;
export const MyRoomDocument = new TypedDocumentString(`
    query MyRoom {
  myRoom {
    ...RoomFields
  }
}
    fragment PersonFields on Person {
  id
  name
  profileUrl
  knownForDepartment
}
fragment MemberFields on Member {
  userId
  displayName
  avatarUrl
  isMe
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  plexAvailable
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
}`) as unknown as TypedDocumentString<MyRoomQuery, MyRoomQueryVariables>;
export const DeckDocument = new TypedDocumentString(`
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
}`) as unknown as TypedDocumentString<DeckQuery, DeckQueryVariables>;
export const FilterPreviewDocument = new TypedDocumentString(`
    query FilterPreview($filters: FiltersInput!) {
  filterPreview(filters: $filters) {
    totalResults
    posterUrls
  }
}
    `) as unknown as TypedDocumentString<FilterPreviewQuery, FilterPreviewQueryVariables>;
export const MovieDocument = new TypedDocumentString(`
    query Movie($id: Int!) {
  movie(id: $id) {
    ...MovieFields
  }
}
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
}`) as unknown as TypedDocumentString<MovieQuery, MovieQueryVariables>;
export const TrailerDocument = new TypedDocumentString(`
    query Trailer($movieId: Int!) {
  trailer(movieId: $movieId)
}
    `) as unknown as TypedDocumentString<TrailerQuery, TrailerQueryVariables>;
export const WatchOptionsDocument = new TypedDocumentString(`
    query WatchOptions($movieId: Int!) {
  watchOptions(movieId: $movieId) {
    serviceId
    serviceName
    type
    link
    logoUrl
  }
}
    `) as unknown as TypedDocumentString<WatchOptionsQuery, WatchOptionsQueryVariables>;
export const PlexStatusDocument = new TypedDocumentString(`
    query PlexStatus($movieId: Int!) {
  plexStatus(movieId: $movieId) {
    ...PlexStatusFields
  }
}
    fragment PlexStatusFields on PlexStatus {
  availability
  canRequest
}`) as unknown as TypedDocumentString<PlexStatusQuery, PlexStatusQueryVariables>;
export const GenresDocument = new TypedDocumentString(`
    query Genres {
  genres {
    id
    name
  }
}
    `) as unknown as TypedDocumentString<GenresQuery, GenresQueryVariables>;
export const SearchPeopleDocument = new TypedDocumentString(`
    query SearchPeople($query: String!) {
  searchPeople(query: $query) {
    ...PersonFields
  }
}
    fragment PersonFields on Person {
  id
  name
  profileUrl
  knownForDepartment
}`) as unknown as TypedDocumentString<SearchPeopleQuery, SearchPeopleQueryVariables>;
export const MatchesDocument = new TypedDocumentString(`
    query Matches($limit: Int, $nextToken: String) {
  matches(limit: $limit, nextToken: $nextToken) {
    nextToken
    matches {
      ...MatchFields
    }
  }
}
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
fragment MatchFields on Match {
  id
  roomId
  round
  matchedAt
  movie {
    ...MovieFields
  }
}`) as unknown as TypedDocumentString<MatchesQuery, MatchesQueryVariables>;
export const SwipeHistoryDocument = new TypedDocumentString(`
    query SwipeHistory($limit: Int, $nextToken: String) {
  swipeHistory(limit: $limit, nextToken: $nextToken) {
    nextToken
    entries {
      ...HistoryEntryFields
    }
  }
}
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
fragment HistoryEntryFields on HistoryEntry {
  direction
  round
  swipedAt
  movie {
    ...MovieFields
  }
}`) as unknown as TypedDocumentString<SwipeHistoryQuery, SwipeHistoryQueryVariables>;
export const PendingMatchDocument = new TypedDocumentString(`
    query PendingMatch {
  pendingMatch {
    ...MatchFields
  }
}
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
fragment MatchFields on Match {
  id
  roomId
  round
  matchedAt
  movie {
    ...MovieFields
  }
}`) as unknown as TypedDocumentString<PendingMatchQuery, PendingMatchQueryVariables>;
export const SwipeDocument = new TypedDocumentString(`
    mutation Swipe($movieId: Int!, $direction: SwipeDirection!) {
  swipe(movieId: $movieId, direction: $direction) {
    movieId
    direction
    match {
      ...MatchFields
    }
  }
}
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
fragment MatchFields on Match {
  id
  roomId
  round
  matchedAt
  movie {
    ...MovieFields
  }
}`) as unknown as TypedDocumentString<SwipeMutation, SwipeMutationVariables>;
export const UndoSwipeDocument = new TypedDocumentString(`
    mutation UndoSwipe($movieId: Int!) {
  undoSwipe(movieId: $movieId) {
    movieId
    undone
  }
}
    `) as unknown as TypedDocumentString<UndoSwipeMutation, UndoSwipeMutationVariables>;
export const UpdateFiltersDocument = new TypedDocumentString(`
    mutation UpdateFilters($filters: FiltersInput!) {
  updateFilters(filters: $filters) {
    ...RoomFields
  }
}
    fragment PersonFields on Person {
  id
  name
  profileUrl
  knownForDepartment
}
fragment MemberFields on Member {
  userId
  displayName
  avatarUrl
  isMe
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  plexAvailable
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
}`) as unknown as TypedDocumentString<UpdateFiltersMutation, UpdateFiltersMutationVariables>;
export const UpdateRoomSettingsDocument = new TypedDocumentString(`
    mutation UpdateRoomSettings($matchThreshold: Int!, $requireMajority: Boolean!) {
  updateRoomSettings(
    matchThreshold: $matchThreshold
    requireMajority: $requireMajority
  ) {
    ...RoomFields
  }
}
    fragment PersonFields on Person {
  id
  name
  profileUrl
  knownForDepartment
}
fragment MemberFields on Member {
  userId
  displayName
  avatarUrl
  isMe
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  plexAvailable
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
}`) as unknown as TypedDocumentString<UpdateRoomSettingsMutation, UpdateRoomSettingsMutationVariables>;
export const JoinRoomDocument = new TypedDocumentString(`
    mutation JoinRoom($code: String!) {
  joinRoom(code: $code) {
    ...RoomFields
  }
}
    fragment PersonFields on Person {
  id
  name
  profileUrl
  knownForDepartment
}
fragment MemberFields on Member {
  userId
  displayName
  avatarUrl
  isMe
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  plexAvailable
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
}`) as unknown as TypedDocumentString<JoinRoomMutation, JoinRoomMutationVariables>;
export const LeaveRoomDocument = new TypedDocumentString(`
    mutation LeaveRoom {
  leaveRoom {
    ...RoomFields
  }
}
    fragment PersonFields on Person {
  id
  name
  profileUrl
  knownForDepartment
}
fragment MemberFields on Member {
  userId
  displayName
  avatarUrl
  isMe
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  plexAvailable
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
}`) as unknown as TypedDocumentString<LeaveRoomMutation, LeaveRoomMutationVariables>;
export const StartNewRoundDocument = new TypedDocumentString(`
    mutation StartNewRound($expectedRound: Int!) {
  startNewRound(expectedRound: $expectedRound) {
    ...RoomFields
  }
}
    fragment PersonFields on Person {
  id
  name
  profileUrl
  knownForDepartment
}
fragment MemberFields on Member {
  userId
  displayName
  avatarUrl
  isMe
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  plexAvailable
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
}`) as unknown as TypedDocumentString<StartNewRoundMutation, StartNewRoundMutationVariables>;
export const UpdateProfileDocument = new TypedDocumentString(`
    mutation UpdateProfile($displayName: String, $avatarKey: String) {
  updateProfile(displayName: $displayName, avatarKey: $avatarKey) {
    ...ProfileFields
  }
}
    fragment ProfileFields on Profile {
  id
  email
  displayName
  avatarUrl
  plexLinked
}`) as unknown as TypedDocumentString<UpdateProfileMutation, UpdateProfileMutationVariables>;
export const CreateAvatarUploadDocument = new TypedDocumentString(`
    mutation CreateAvatarUpload($contentType: String!) {
  createAvatarUpload(contentType: $contentType) {
    url
    fields
    key
  }
}
    `) as unknown as TypedDocumentString<CreateAvatarUploadMutation, CreateAvatarUploadMutationVariables>;
export const StartPlexLinkDocument = new TypedDocumentString(`
    mutation StartPlexLink {
  startPlexLink {
    sent
  }
}
    `) as unknown as TypedDocumentString<StartPlexLinkMutation, StartPlexLinkMutationVariables>;
export const ConfirmPlexLinkDocument = new TypedDocumentString(`
    mutation ConfirmPlexLink($code: String!) {
  confirmPlexLink(code: $code) {
    ...ProfileFields
  }
}
    fragment ProfileFields on Profile {
  id
  email
  displayName
  avatarUrl
  plexLinked
}`) as unknown as TypedDocumentString<ConfirmPlexLinkMutation, ConfirmPlexLinkMutationVariables>;
export const UnlinkPlexDocument = new TypedDocumentString(`
    mutation UnlinkPlex {
  unlinkPlex {
    ...ProfileFields
  }
}
    fragment ProfileFields on Profile {
  id
  email
  displayName
  avatarUrl
  plexLinked
}`) as unknown as TypedDocumentString<UnlinkPlexMutation, UnlinkPlexMutationVariables>;
export const RequestOnPlexDocument = new TypedDocumentString(`
    mutation RequestOnPlex($movieId: Int!) {
  requestOnPlex(movieId: $movieId) {
    ...PlexStatusFields
  }
}
    fragment PlexStatusFields on PlexStatus {
  availability
  canRequest
}`) as unknown as TypedDocumentString<RequestOnPlexMutation, RequestOnPlexMutationVariables>;
export const OnRoomEventDocument = new TypedDocumentString(`
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
    `) as unknown as TypedDocumentString<OnRoomEventSubscription, OnRoomEventSubscriptionVariables>;