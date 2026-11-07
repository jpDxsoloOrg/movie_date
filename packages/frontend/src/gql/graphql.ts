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

/** Season ranges live in COMMITMENT_SEASONS in packages/core. Unset means any length. */
export type CommitmentLevel =
  | 'A_FEW_SEASONS'
  | 'LONG_HAUL'
  | 'SHORT_AND_SWEET';

export type DeckCard = {
  mediaType: MediaType;
  /**
   * The card face, set in both modes. For a show this is showAsMovie(show) from
   * packages/core, so movie.id is a TV id: send it with mediaType, never alone.
   */
  movie: Movie;
  /** Set only when mediaType is TV: what a show has and a movie doesn't. */
  show?: Maybe<Show>;
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

/** Room.filters uses the release dates. Room.tvFilters uses the TV fields instead. */
export type Filters = {
  cast: Array<Person>;
  commitment?: Maybe<CommitmentLevel>;
  /** YYYY-MM-DD */
  firstAirDateGte?: Maybe<Scalars['String']['output']>;
  /** YYYY-MM-DD */
  firstAirDateLte?: Maybe<Scalars['String']['output']>;
  genreIds: Array<Scalars['Int']['output']>;
  /** YYYY-MM-DD */
  releaseDateGte?: Maybe<Scalars['String']['output']>;
  /** YYYY-MM-DD */
  releaseDateLte?: Maybe<Scalars['String']['output']>;
  /** Keys from the provider catalogue, e.g. netflix. Empty means any service. plex is ignored unless Room.plexAvailable. */
  services: Array<Scalars['String']['output']>;
  showStatus?: Maybe<ShowStatusFilter>;
};

export type FiltersInput = {
  cast: Array<PersonInput>;
  commitment?: InputMaybe<CommitmentLevel>;
  firstAirDateGte?: InputMaybe<Scalars['String']['input']>;
  firstAirDateLte?: InputMaybe<Scalars['String']['input']>;
  genreIds: Array<Scalars['Int']['input']>;
  releaseDateGte?: InputMaybe<Scalars['String']['input']>;
  releaseDateLte?: InputMaybe<Scalars['String']['input']>;
  services: Array<Scalars['String']['input']>;
  showStatus?: InputMaybe<ShowStatusFilter>;
};

export type Genre = {
  id: Scalars['Int']['output'];
  name: Scalars['String']['output'];
};

export type HistoryEntry = {
  direction: SwipeDirection;
  mediaType: MediaType;
  /** See DeckCard.movie. */
  movie: Movie;
  round: Scalars['Int']['output'];
  /** Set only when mediaType is TV. */
  show?: Maybe<Show>;
  swipedAt: Scalars['AWSDateTime']['output'];
};

export type HistoryPage = {
  entries: Array<HistoryEntry>;
  nextToken?: Maybe<Scalars['String']['output']>;
};

export type Match = {
  /** Someone cleared it: it stays in history but nobody is told about it again. */
  cleared: Scalars['Boolean']['output'];
  id: Scalars['ID']['output'];
  matchedAt: Scalars['AWSDateTime']['output'];
  mediaType: MediaType;
  /** See DeckCard.movie. */
  movie: Movie;
  roomId: Scalars['ID']['output'];
  round: Scalars['Int']['output'];
  /** Set only when mediaType is TV. */
  show?: Maybe<Show>;
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

/** Also the face of a show on cards, matches and history. See DeckCard.movie. */
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
  /** Stops one match of the mode's current round being announced, leaving the deck and round as they are. False if it isn't in the current round. */
  clearMatch: Scalars['Boolean']['output'];
  confirmPlexLink: Profile;
  createAvatarUpload: AvatarUpload;
  /** Case-insensitive. Leaves the caller's current room first. */
  joinRoom: Room;
  /** Leaves the current room and puts the caller in a new one of their own. */
  leaveRoom: Room;
  /** Backend only. Pass-through that fans out to onRoomEvent subscribers. */
  publishRoomEvent: RoomEvent;
  /** Acts only as the caller's linked account. A duplicate comes back as REQUESTED. seasons is for shows, and null means all of them. */
  requestOnPlex: PlexStatus;
  /** Backend only. Closes a departed member's open onRoomEvent subscriptions to that room. */
  revokeRoomSubscriptions?: Maybe<Scalars['Boolean']['output']>;
  /** Back to Start for one mode. expectedRound makes a double press from two members a no-op. */
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


export type MutationClearMatchArgs = {
  matchId: Scalars['ID']['input'];
  mediaType?: InputMaybe<MediaType>;
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
  mediaType?: InputMaybe<MediaType>;
  movieId: Scalars['Int']['input'];
  seasons?: InputMaybe<Array<Scalars['Int']['input']>>;
};


export type MutationRevokeRoomSubscriptionsArgs = {
  roomId: Scalars['ID']['input'];
  userId: Scalars['ID']['input'];
};


export type MutationStartNewRoundArgs = {
  expectedRound: Scalars['Int']['input'];
  mediaType?: InputMaybe<MediaType>;
};


export type MutationSwipeArgs = {
  direction: SwipeDirection;
  mediaType?: InputMaybe<MediaType>;
  movieId: Scalars['Int']['input'];
};


export type MutationUndoSwipeArgs = {
  mediaType?: InputMaybe<MediaType>;
  movieId: Scalars['Int']['input'];
};


export type MutationUpdateFiltersArgs = {
  filters: FiltersInput;
  mediaType?: InputMaybe<MediaType>;
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
  /** Shows only: season numbers with no file. AVAILABLE with any listed is the partial state. */
  missingSeasons?: Maybe<Array<Scalars['Int']['output']>>;
  /** Shows only, when canRequest: how many seasons the show has today, for the season picker. */
  seasonCount?: Maybe<Scalars['Int']['output']>;
};

export type Profile = {
  avatarUrl?: Maybe<Scalars['String']['output']>;
  displayName: Scalars['String']['output'];
  email: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  plexLinked: Scalars['Boolean']['output'];
};

export type Query = {
  /** Unswiped titles for the caller. page starts at 1. */
  deck: DeckPage;
  /** Takes draft filters because deck() only reads the saved ones. Call it debounced. */
  filterPreview: FilterPreview;
  genres: Array<Genre>;
  /** One mode's matches in the caller's room, newest first, across all rounds. */
  matches: MatchPage;
  /** Creates the profile and a first room on first call, so sign-up needs no extra step. */
  me: Profile;
  movie: Movie;
  /** The caller's current room. */
  myRoom: Room;
  /** The current round's earliest uncleared match made since the caller joined, for clients that were offline when it happened. */
  pendingMatch?: Maybe<Match>;
  /** Null when the caller hasn't linked Plex Request. */
  plexStatus?: Maybe<PlexStatus>;
  searchPeople: Array<Person>;
  /** The caller's own swipes in one mode in the current room, newest first. */
  swipeHistory: HistoryPage;
  /** YouTube id of the best trailer, or null. */
  trailer?: Maybe<Scalars['String']['output']>;
  watchOptions: Array<WatchOption>;
};


export type QueryDeckArgs = {
  mediaType?: InputMaybe<MediaType>;
  page: Scalars['Int']['input'];
};


export type QueryFilterPreviewArgs = {
  filters: FiltersInput;
  mediaType?: InputMaybe<MediaType>;
};


export type QueryGenresArgs = {
  mediaType?: InputMaybe<MediaType>;
};


export type QueryMatchesArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  mediaType?: InputMaybe<MediaType>;
  nextToken?: InputMaybe<Scalars['String']['input']>;
};


export type QueryMovieArgs = {
  id: Scalars['Int']['input'];
};


export type QueryPendingMatchArgs = {
  mediaType?: InputMaybe<MediaType>;
};


export type QueryPlexStatusArgs = {
  mediaType?: InputMaybe<MediaType>;
  movieId: Scalars['Int']['input'];
};


export type QuerySearchPeopleArgs = {
  query: Scalars['String']['input'];
};


export type QuerySwipeHistoryArgs = {
  limit?: InputMaybe<Scalars['Int']['input']>;
  mediaType?: InputMaybe<MediaType>;
  nextToken?: InputMaybe<Scalars['String']['input']>;
};


export type QueryTrailerArgs = {
  mediaType?: InputMaybe<MediaType>;
  movieId: Scalars['Int']['input'];
};


export type QueryWatchOptionsArgs = {
  mediaType?: InputMaybe<MediaType>;
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
  /** Going Steady's own filters. Empty until someone saves them. */
  tvFilters: Filters;
  /** Going Steady's own round, so Keep Looking never resets the movie deck. */
  tvRound: Scalars['Int']['output'];
};

export type RoomEvent = {
  /** Who caused it, so a client can ignore its own echo. */
  actorId?: Maybe<Scalars['ID']['output']>;
  matchId?: Maybe<Scalars['ID']['output']>;
  /** Which mode a match or reset belongs to. Null on events that concern the whole room. */
  mediaType?: Maybe<MediaType>;
  movieId?: Maybe<Scalars['Int']['output']>;
  roomId: Scalars['ID']['output'];
  round?: Maybe<Scalars['Int']['output']>;
  type: RoomEventType;
};

export type RoomEventInput = {
  actorId?: InputMaybe<Scalars['ID']['input']>;
  matchId?: InputMaybe<Scalars['ID']['input']>;
  mediaType?: InputMaybe<MediaType>;
  movieId?: InputMaybe<Scalars['Int']['input']>;
  roomId: Scalars['ID']['input'];
  round?: InputMaybe<Scalars['Int']['input']>;
  type: RoomEventType;
};

export type RoomEventType =
  /** Someone cleared a match. matchId and mediaType are set. Nobody is routed to it again. */
  | 'MATCH_CLEARED'
  /** A swipe completed a match. movieId, matchId and mediaType are set. */
  | 'MATCH_FOUND'
  /** Someone joined or left. Clients reload the member list. */
  | 'MEMBERS_CHANGED'
  /** Filters or match threshold changed. Clients reload the deck/room. mediaType is set when one mode's filters changed. */
  | 'ROOM_UPDATED'
  /** Back to Start was pressed. round is the new round of mediaType's mode; clients in that mode restart the deck. */
  | 'ROUND_RESET';

/** A TV series. title is TMDB's name, so the fields it shares with Movie read the same. */
export type Show = {
  backdropUrl?: Maybe<Scalars['String']['output']>;
  episodeCount?: Maybe<Scalars['Int']['output']>;
  /** Typical episode length in minutes. Null when TMDB has none, in which case hide it. */
  episodeRuntime?: Maybe<Scalars['Int']['output']>;
  firstAirYear?: Maybe<Scalars['Int']['output']>;
  genres: Array<Scalars['String']['output']>;
  id: Scalars['Int']['output'];
  /** Null until an episode has aired. */
  lastAirYear?: Maybe<Scalars['Int']['output']>;
  networks: Array<Scalars['String']['output']>;
  overview: Scalars['String']['output'];
  posterUrl?: Maybe<Scalars['String']['output']>;
  seasonCount?: Maybe<Scalars['Int']['output']>;
  /** TMDB's wording, e.g. Returning Series or Ended. */
  status?: Maybe<Scalars['String']['output']>;
  title: Scalars['String']['output'];
  voteAverage?: Maybe<Scalars['Float']['output']>;
};

/** The status choice on the TV filters. Unset means either. */
export type ShowStatusFilter =
  | 'FINISHED'
  | 'RUNNING';

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
  mediaType: MediaType;
  movieId: Scalars['Int']['output'];
};

export type UndoResult = {
  mediaType: MediaType;
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

export type PlexStatusFieldsFragment = { availability: PlexAvailability, canRequest: boolean, missingSeasons?: Array<number> | null, seasonCount?: number | null };

export type PersonFieldsFragment = { id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null };

export type MemberFieldsFragment = { userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean };

export type FiltersFieldsFragment = { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> };

export type RoomFieldsFragment = { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, tvRound: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, tvFilters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> };

export type MovieFieldsFragment = { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> };

export type ShowFieldsFragment = { id: number, title: string, overview: string, firstAirYear?: number | null, lastAirYear?: number | null, status?: string | null, seasonCount?: number | null, episodeCount?: number | null, networks: Array<string>, episodeRuntime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> };

export type MatchFieldsFragment = { id: string, roomId: string, round: number, matchedAt: string, mediaType: MediaType, cleared: boolean, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> }, show?: { id: number, title: string, overview: string, firstAirYear?: number | null, lastAirYear?: number | null, status?: string | null, seasonCount?: number | null, episodeCount?: number | null, networks: Array<string>, episodeRuntime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } | null };

export type HistoryEntryFieldsFragment = { direction: SwipeDirection, round: number, swipedAt: string, mediaType: MediaType, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> }, show?: { id: number, title: string, overview: string, firstAirYear?: number | null, lastAirYear?: number | null, status?: string | null, seasonCount?: number | null, episodeCount?: number | null, networks: Array<string>, episodeRuntime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } | null };

export type MeQueryVariables = Exact<{ [key: string]: never; }>;


export type MeQuery = { me: { id: string, email: string, displayName: string, avatarUrl?: string | null, plexLinked: boolean } };

export type MyRoomQueryVariables = Exact<{ [key: string]: never; }>;


export type MyRoomQuery = { myRoom: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, tvRound: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, tvFilters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

export type DeckQueryVariables = Exact<{
  page: Scalars['Int']['input'];
  mediaType?: InputMaybe<MediaType>;
}>;


export type DeckQuery = { deck: { nextPage?: number | null, cards: Array<{ mediaType: MediaType, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> }, show?: { id: number, title: string, overview: string, firstAirYear?: number | null, lastAirYear?: number | null, status?: string | null, seasonCount?: number | null, episodeCount?: number | null, networks: Array<string>, episodeRuntime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } | null }> } };

export type FilterPreviewQueryVariables = Exact<{
  filters: FiltersInput;
  mediaType?: InputMaybe<MediaType>;
}>;


export type FilterPreviewQuery = { filterPreview: { totalResults?: number | null, posterUrls: Array<string> } };

export type MovieQueryVariables = Exact<{
  id: Scalars['Int']['input'];
}>;


export type MovieQuery = { movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } };

export type TrailerQueryVariables = Exact<{
  movieId: Scalars['Int']['input'];
  mediaType?: InputMaybe<MediaType>;
}>;


export type TrailerQuery = { trailer?: string | null };

export type WatchOptionsQueryVariables = Exact<{
  movieId: Scalars['Int']['input'];
  mediaType?: InputMaybe<MediaType>;
}>;


export type WatchOptionsQuery = { watchOptions: Array<{ serviceId: string, serviceName: string, type: string, link?: string | null, logoUrl?: string | null }> };

export type PlexStatusQueryVariables = Exact<{
  movieId: Scalars['Int']['input'];
  mediaType?: InputMaybe<MediaType>;
}>;


export type PlexStatusQuery = { plexStatus?: { availability: PlexAvailability, canRequest: boolean, missingSeasons?: Array<number> | null, seasonCount?: number | null } | null };

export type GenresQueryVariables = Exact<{
  mediaType?: InputMaybe<MediaType>;
}>;


export type GenresQuery = { genres: Array<{ id: number, name: string }> };

export type SearchPeopleQueryVariables = Exact<{
  query: Scalars['String']['input'];
}>;


export type SearchPeopleQuery = { searchPeople: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> };

export type MatchesQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  nextToken?: InputMaybe<Scalars['String']['input']>;
  mediaType?: InputMaybe<MediaType>;
}>;


export type MatchesQuery = { matches: { nextToken?: string | null, matches: Array<{ id: string, roomId: string, round: number, matchedAt: string, mediaType: MediaType, cleared: boolean, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> }, show?: { id: number, title: string, overview: string, firstAirYear?: number | null, lastAirYear?: number | null, status?: string | null, seasonCount?: number | null, episodeCount?: number | null, networks: Array<string>, episodeRuntime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } | null }> } };

export type SwipeHistoryQueryVariables = Exact<{
  limit?: InputMaybe<Scalars['Int']['input']>;
  nextToken?: InputMaybe<Scalars['String']['input']>;
  mediaType?: InputMaybe<MediaType>;
}>;


export type SwipeHistoryQuery = { swipeHistory: { nextToken?: string | null, entries: Array<{ direction: SwipeDirection, round: number, swipedAt: string, mediaType: MediaType, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> }, show?: { id: number, title: string, overview: string, firstAirYear?: number | null, lastAirYear?: number | null, status?: string | null, seasonCount?: number | null, episodeCount?: number | null, networks: Array<string>, episodeRuntime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } | null }> } };

export type PendingMatchQueryVariables = Exact<{
  mediaType?: InputMaybe<MediaType>;
}>;


export type PendingMatchQuery = { pendingMatch?: { id: string, roomId: string, round: number, matchedAt: string, mediaType: MediaType, cleared: boolean, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> }, show?: { id: number, title: string, overview: string, firstAirYear?: number | null, lastAirYear?: number | null, status?: string | null, seasonCount?: number | null, episodeCount?: number | null, networks: Array<string>, episodeRuntime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } | null } | null };

export type SwipeMutationVariables = Exact<{
  movieId: Scalars['Int']['input'];
  direction: SwipeDirection;
  mediaType?: InputMaybe<MediaType>;
}>;


export type SwipeMutation = { swipe: { movieId: number, mediaType: MediaType, direction: SwipeDirection, match?: { id: string, roomId: string, round: number, matchedAt: string, mediaType: MediaType, cleared: boolean, movie: { id: number, title: string, overview: string, releaseYear?: number | null, runtime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> }, show?: { id: number, title: string, overview: string, firstAirYear?: number | null, lastAirYear?: number | null, status?: string | null, seasonCount?: number | null, episodeCount?: number | null, networks: Array<string>, episodeRuntime?: number | null, voteAverage?: number | null, posterUrl?: string | null, backdropUrl?: string | null, genres: Array<string> } | null } | null } };

export type UndoSwipeMutationVariables = Exact<{
  movieId: Scalars['Int']['input'];
  mediaType?: InputMaybe<MediaType>;
}>;


export type UndoSwipeMutation = { undoSwipe: { movieId: number, mediaType: MediaType, undone: boolean } };

export type UpdateFiltersMutationVariables = Exact<{
  filters: FiltersInput;
  mediaType?: InputMaybe<MediaType>;
}>;


export type UpdateFiltersMutation = { updateFilters: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, tvRound: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, tvFilters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

export type UpdateRoomSettingsMutationVariables = Exact<{
  matchThreshold: Scalars['Int']['input'];
  requireMajority: Scalars['Boolean']['input'];
}>;


export type UpdateRoomSettingsMutation = { updateRoomSettings: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, tvRound: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, tvFilters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

export type JoinRoomMutationVariables = Exact<{
  code: Scalars['String']['input'];
}>;


export type JoinRoomMutation = { joinRoom: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, tvRound: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, tvFilters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

export type LeaveRoomMutationVariables = Exact<{ [key: string]: never; }>;


export type LeaveRoomMutation = { leaveRoom: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, tvRound: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, tvFilters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

export type StartNewRoundMutationVariables = Exact<{
  expectedRound: Scalars['Int']['input'];
  mediaType?: InputMaybe<MediaType>;
}>;


export type StartNewRoundMutation = { startNewRound: { id: string, code: string, matchThreshold: number, requireMajority: boolean, round: number, tvRound: number, plexAvailable: boolean, filters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, tvFilters: { genreIds: Array<number>, services: Array<string>, releaseDateGte?: string | null, releaseDateLte?: string | null, showStatus?: ShowStatusFilter | null, commitment?: CommitmentLevel | null, firstAirDateGte?: string | null, firstAirDateLte?: string | null, cast: Array<{ id: number, name: string, profileUrl?: string | null, knownForDepartment?: string | null }> }, members: Array<{ userId: string, displayName: string, avatarUrl?: string | null, isMe: boolean }> } };

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
  mediaType?: InputMaybe<MediaType>;
  seasons?: InputMaybe<Array<Scalars['Int']['input']> | Scalars['Int']['input']>;
}>;


export type RequestOnPlexMutation = { requestOnPlex: { availability: PlexAvailability, canRequest: boolean, missingSeasons?: Array<number> | null, seasonCount?: number | null } };

export type ClearMatchMutationVariables = Exact<{
  matchId: Scalars['ID']['input'];
  mediaType?: InputMaybe<MediaType>;
}>;


export type ClearMatchMutation = { clearMatch: boolean };

export type OnRoomEventSubscriptionVariables = Exact<{
  roomId: Scalars['ID']['input'];
}>;


export type OnRoomEventSubscription = { onRoomEvent?: { roomId: string, type: RoomEventType, movieId?: number | null, mediaType?: MediaType | null, matchId?: string | null, round?: number | null, actorId?: string | null } | null };

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
  missingSeasons
  seasonCount
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
export const FiltersFieldsFragmentDoc = new TypedDocumentString(`
    fragment FiltersFields on Filters {
  genreIds
  services
  releaseDateGte
  releaseDateLte
  showStatus
  commitment
  firstAirDateGte
  firstAirDateLte
  cast {
    ...PersonFields
  }
}
    fragment PersonFields on Person {
  id
  name
  profileUrl
  knownForDepartment
}`, {"fragmentName":"FiltersFields"}) as unknown as TypedDocumentString<FiltersFieldsFragment, unknown>;
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
  tvRound
  plexAvailable
  filters {
    ...FiltersFields
  }
  tvFilters {
    ...FiltersFields
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
}
fragment FiltersFields on Filters {
  genreIds
  services
  releaseDateGte
  releaseDateLte
  showStatus
  commitment
  firstAirDateGte
  firstAirDateLte
  cast {
    ...PersonFields
  }
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
export const ShowFieldsFragmentDoc = new TypedDocumentString(`
    fragment ShowFields on Show {
  id
  title
  overview
  firstAirYear
  lastAirYear
  status
  seasonCount
  episodeCount
  networks
  episodeRuntime
  voteAverage
  posterUrl
  backdropUrl
  genres
}
    `, {"fragmentName":"ShowFields"}) as unknown as TypedDocumentString<ShowFieldsFragment, unknown>;
export const MatchFieldsFragmentDoc = new TypedDocumentString(`
    fragment MatchFields on Match {
  id
  roomId
  round
  matchedAt
  mediaType
  cleared
  movie {
    ...MovieFields
  }
  show {
    ...ShowFields
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
fragment ShowFields on Show {
  id
  title
  overview
  firstAirYear
  lastAirYear
  status
  seasonCount
  episodeCount
  networks
  episodeRuntime
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
  mediaType
  movie {
    ...MovieFields
  }
  show {
    ...ShowFields
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
fragment ShowFields on Show {
  id
  title
  overview
  firstAirYear
  lastAirYear
  status
  seasonCount
  episodeCount
  networks
  episodeRuntime
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
fragment FiltersFields on Filters {
  genreIds
  services
  releaseDateGte
  releaseDateLte
  showStatus
  commitment
  firstAirDateGte
  firstAirDateLte
  cast {
    ...PersonFields
  }
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  tvRound
  plexAvailable
  filters {
    ...FiltersFields
  }
  tvFilters {
    ...FiltersFields
  }
  members {
    ...MemberFields
  }
}`) as unknown as TypedDocumentString<MyRoomQuery, MyRoomQueryVariables>;
export const DeckDocument = new TypedDocumentString(`
    query Deck($page: Int!, $mediaType: MediaType) {
  deck(page: $page, mediaType: $mediaType) {
    nextPage
    cards {
      mediaType
      movie {
        ...MovieFields
      }
      show {
        ...ShowFields
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
}
fragment ShowFields on Show {
  id
  title
  overview
  firstAirYear
  lastAirYear
  status
  seasonCount
  episodeCount
  networks
  episodeRuntime
  voteAverage
  posterUrl
  backdropUrl
  genres
}`) as unknown as TypedDocumentString<DeckQuery, DeckQueryVariables>;
export const FilterPreviewDocument = new TypedDocumentString(`
    query FilterPreview($filters: FiltersInput!, $mediaType: MediaType) {
  filterPreview(filters: $filters, mediaType: $mediaType) {
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
    query Trailer($movieId: Int!, $mediaType: MediaType) {
  trailer(movieId: $movieId, mediaType: $mediaType)
}
    `) as unknown as TypedDocumentString<TrailerQuery, TrailerQueryVariables>;
export const WatchOptionsDocument = new TypedDocumentString(`
    query WatchOptions($movieId: Int!, $mediaType: MediaType) {
  watchOptions(movieId: $movieId, mediaType: $mediaType) {
    serviceId
    serviceName
    type
    link
    logoUrl
  }
}
    `) as unknown as TypedDocumentString<WatchOptionsQuery, WatchOptionsQueryVariables>;
export const PlexStatusDocument = new TypedDocumentString(`
    query PlexStatus($movieId: Int!, $mediaType: MediaType) {
  plexStatus(movieId: $movieId, mediaType: $mediaType) {
    ...PlexStatusFields
  }
}
    fragment PlexStatusFields on PlexStatus {
  availability
  canRequest
  missingSeasons
  seasonCount
}`) as unknown as TypedDocumentString<PlexStatusQuery, PlexStatusQueryVariables>;
export const GenresDocument = new TypedDocumentString(`
    query Genres($mediaType: MediaType) {
  genres(mediaType: $mediaType) {
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
    query Matches($limit: Int, $nextToken: String, $mediaType: MediaType) {
  matches(limit: $limit, nextToken: $nextToken, mediaType: $mediaType) {
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
fragment ShowFields on Show {
  id
  title
  overview
  firstAirYear
  lastAirYear
  status
  seasonCount
  episodeCount
  networks
  episodeRuntime
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
  mediaType
  cleared
  movie {
    ...MovieFields
  }
  show {
    ...ShowFields
  }
}`) as unknown as TypedDocumentString<MatchesQuery, MatchesQueryVariables>;
export const SwipeHistoryDocument = new TypedDocumentString(`
    query SwipeHistory($limit: Int, $nextToken: String, $mediaType: MediaType) {
  swipeHistory(limit: $limit, nextToken: $nextToken, mediaType: $mediaType) {
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
fragment ShowFields on Show {
  id
  title
  overview
  firstAirYear
  lastAirYear
  status
  seasonCount
  episodeCount
  networks
  episodeRuntime
  voteAverage
  posterUrl
  backdropUrl
  genres
}
fragment HistoryEntryFields on HistoryEntry {
  direction
  round
  swipedAt
  mediaType
  movie {
    ...MovieFields
  }
  show {
    ...ShowFields
  }
}`) as unknown as TypedDocumentString<SwipeHistoryQuery, SwipeHistoryQueryVariables>;
export const PendingMatchDocument = new TypedDocumentString(`
    query PendingMatch($mediaType: MediaType) {
  pendingMatch(mediaType: $mediaType) {
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
fragment ShowFields on Show {
  id
  title
  overview
  firstAirYear
  lastAirYear
  status
  seasonCount
  episodeCount
  networks
  episodeRuntime
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
  mediaType
  cleared
  movie {
    ...MovieFields
  }
  show {
    ...ShowFields
  }
}`) as unknown as TypedDocumentString<PendingMatchQuery, PendingMatchQueryVariables>;
export const SwipeDocument = new TypedDocumentString(`
    mutation Swipe($movieId: Int!, $direction: SwipeDirection!, $mediaType: MediaType) {
  swipe(movieId: $movieId, direction: $direction, mediaType: $mediaType) {
    movieId
    mediaType
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
fragment ShowFields on Show {
  id
  title
  overview
  firstAirYear
  lastAirYear
  status
  seasonCount
  episodeCount
  networks
  episodeRuntime
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
  mediaType
  cleared
  movie {
    ...MovieFields
  }
  show {
    ...ShowFields
  }
}`) as unknown as TypedDocumentString<SwipeMutation, SwipeMutationVariables>;
export const UndoSwipeDocument = new TypedDocumentString(`
    mutation UndoSwipe($movieId: Int!, $mediaType: MediaType) {
  undoSwipe(movieId: $movieId, mediaType: $mediaType) {
    movieId
    mediaType
    undone
  }
}
    `) as unknown as TypedDocumentString<UndoSwipeMutation, UndoSwipeMutationVariables>;
export const UpdateFiltersDocument = new TypedDocumentString(`
    mutation UpdateFilters($filters: FiltersInput!, $mediaType: MediaType) {
  updateFilters(filters: $filters, mediaType: $mediaType) {
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
fragment FiltersFields on Filters {
  genreIds
  services
  releaseDateGte
  releaseDateLte
  showStatus
  commitment
  firstAirDateGte
  firstAirDateLte
  cast {
    ...PersonFields
  }
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  tvRound
  plexAvailable
  filters {
    ...FiltersFields
  }
  tvFilters {
    ...FiltersFields
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
fragment FiltersFields on Filters {
  genreIds
  services
  releaseDateGte
  releaseDateLte
  showStatus
  commitment
  firstAirDateGte
  firstAirDateLte
  cast {
    ...PersonFields
  }
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  tvRound
  plexAvailable
  filters {
    ...FiltersFields
  }
  tvFilters {
    ...FiltersFields
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
fragment FiltersFields on Filters {
  genreIds
  services
  releaseDateGte
  releaseDateLte
  showStatus
  commitment
  firstAirDateGte
  firstAirDateLte
  cast {
    ...PersonFields
  }
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  tvRound
  plexAvailable
  filters {
    ...FiltersFields
  }
  tvFilters {
    ...FiltersFields
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
fragment FiltersFields on Filters {
  genreIds
  services
  releaseDateGte
  releaseDateLte
  showStatus
  commitment
  firstAirDateGte
  firstAirDateLte
  cast {
    ...PersonFields
  }
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  tvRound
  plexAvailable
  filters {
    ...FiltersFields
  }
  tvFilters {
    ...FiltersFields
  }
  members {
    ...MemberFields
  }
}`) as unknown as TypedDocumentString<LeaveRoomMutation, LeaveRoomMutationVariables>;
export const StartNewRoundDocument = new TypedDocumentString(`
    mutation StartNewRound($expectedRound: Int!, $mediaType: MediaType) {
  startNewRound(expectedRound: $expectedRound, mediaType: $mediaType) {
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
fragment FiltersFields on Filters {
  genreIds
  services
  releaseDateGte
  releaseDateLte
  showStatus
  commitment
  firstAirDateGte
  firstAirDateLte
  cast {
    ...PersonFields
  }
}
fragment RoomFields on Room {
  id
  code
  matchThreshold
  requireMajority
  round
  tvRound
  plexAvailable
  filters {
    ...FiltersFields
  }
  tvFilters {
    ...FiltersFields
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
    mutation RequestOnPlex($movieId: Int!, $mediaType: MediaType, $seasons: [Int!]) {
  requestOnPlex(movieId: $movieId, mediaType: $mediaType, seasons: $seasons) {
    ...PlexStatusFields
  }
}
    fragment PlexStatusFields on PlexStatus {
  availability
  canRequest
  missingSeasons
  seasonCount
}`) as unknown as TypedDocumentString<RequestOnPlexMutation, RequestOnPlexMutationVariables>;
export const ClearMatchDocument = new TypedDocumentString(`
    mutation ClearMatch($matchId: ID!, $mediaType: MediaType) {
  clearMatch(matchId: $matchId, mediaType: $mediaType)
}
    `) as unknown as TypedDocumentString<ClearMatchMutation, ClearMatchMutationVariables>;
export const OnRoomEventDocument = new TypedDocumentString(`
    subscription OnRoomEvent($roomId: ID!) {
  onRoomEvent(roomId: $roomId) {
    roomId
    type
    movieId
    mediaType
    matchId
    round
    actorId
  }
}
    `) as unknown as TypedDocumentString<OnRoomEventSubscription, OnRoomEventSubscriptionVariables>;