/**
 * Domain types mirroring graphql/schema.graphql. A nullable GraphQL field is
 * `T | null` on output types and optional on input types, because AppSync omits
 * unset input fields rather than sending null.
 */

export type SwipeDirection = "LIKE" | "PASS";

export type MediaType = "MOVIE" | "TV";

export type ShowStatusFilter = "RUNNING" | "FINISHED";

export type CommitmentLevel = "SHORT_AND_SWEET" | "A_FEW_SEASONS" | "LONG_HAUL";

export type PlexAvailability = "AVAILABLE" | "MONITORED" | "REQUESTED" | "NOT_IN_LIBRARY";

export type RoomEventType =
  | "MATCH_FOUND"
  | "ROOM_UPDATED"
  | "MEMBERS_CHANGED"
  | "ROUND_RESET";

export type WatchOptionType = "subscription" | "free" | "rent" | "buy" | "addon" | "library";

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  plexLinked: boolean;
}

export interface Member {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  isMe: boolean;
}

export interface Person {
  id: number;
  name: string;
  profileUrl?: string | null;
  knownForDepartment?: string | null;
}

export interface Genre {
  id: number;
  name: string;
}

export interface Filters {
  genreIds: number[];
  cast: Person[];
  services: string[];
  releaseDateGte?: string | null;
  releaseDateLte?: string | null;
  showStatus?: ShowStatusFilter | null;
  commitment?: CommitmentLevel | null;
  firstAirDateGte?: string | null;
  firstAirDateLte?: string | null;
}

export interface Room {
  id: string;
  code: string;
  filters: Filters;
  tvFilters: Filters;
  matchThreshold: number;
  requireMajority: boolean;
  round: number;
  tvRound: number;
  members: Member[];
  plexAvailable: boolean;
}

export interface Movie {
  id: number;
  title: string;
  overview: string;
  releaseYear: number | null;
  runtime: number | null;
  voteAverage: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
}

export interface Show {
  id: number;
  title: string;
  overview: string;
  firstAirYear: number | null;
  lastAirYear: number | null;
  status: string | null;
  seasonCount: number | null;
  episodeCount: number | null;
  networks: string[];
  episodeRuntime: number | null;
  voteAverage: number | null;
  posterUrl: string | null;
  backdropUrl: string | null;
  genres: string[];
}

export interface DeckCard {
  mediaType: MediaType;
  /** The card face in both modes. For a show this is `showAsMovie(show)`. */
  movie: Movie;
  show: Show | null;
  likedByRoommate: boolean;
}

export interface DeckPage {
  cards: DeckCard[];
  nextPage: number | null;
}

export interface FilterPreview {
  totalResults: number | null;
  posterUrls: string[];
}

export interface Match {
  id: string;
  roomId: string;
  round: number;
  matchedAt: string;
  mediaType: MediaType;
  movie: Movie;
  show: Show | null;
}

export interface SwipeResult {
  movieId: number;
  mediaType: MediaType;
  direction: SwipeDirection;
  match: Match | null;
}

export interface UndoResult {
  movieId: number;
  mediaType: MediaType;
  undone: boolean;
}

export interface WatchOption {
  serviceId: string;
  serviceName: string;
  type: WatchOptionType;
  link: string | null;
  logoUrl: string | null;
}

export interface HistoryEntry {
  mediaType: MediaType;
  movie: Movie;
  show: Show | null;
  direction: SwipeDirection;
  round: number;
  swipedAt: string;
}

export interface HistoryPage {
  entries: HistoryEntry[];
  nextToken: string | null;
}

export interface MatchPage {
  matches: Match[];
  nextToken: string | null;
}

export interface PlexStatus {
  availability: PlexAvailability;
  canRequest: boolean;
  missingSeasons?: number[] | null;
}

export interface PlexLinkStart {
  sent: boolean;
}

export interface AvatarUpload {
  url: string;
  /** AWSJSON: a JSON-encoded string, not an object. */
  fields: string;
  key: string;
}

export interface RoomEvent {
  roomId: string;
  type: RoomEventType;
  movieId: number | null;
  mediaType: MediaType | null;
  matchId: string | null;
  round: number | null;
  actorId: string | null;
}

export interface RoomEventInput {
  roomId: string;
  type: RoomEventType;
  movieId?: number | null;
  mediaType?: MediaType | null;
  matchId?: string | null;
  round?: number | null;
  actorId?: string | null;
}

/** Optional everywhere it appears; read it through `resolveMediaType`. */
export interface MediaTypeArgument {
  mediaType?: MediaType | null;
}

/** Arguments of every API field, keyed by field name. */
export interface FieldArguments {
  me: Record<string, never>;
  myRoom: Record<string, never>;
  deck: { page: number } & MediaTypeArgument;
  filterPreview: { filters: Filters } & MediaTypeArgument;
  movie: { id: number };
  trailer: { movieId: number } & MediaTypeArgument;
  watchOptions: { movieId: number } & MediaTypeArgument;
  plexStatus: { movieId: number } & MediaTypeArgument;
  genres: MediaTypeArgument;
  searchPeople: { query: string };
  matches: { limit?: number | null; nextToken?: string | null } & MediaTypeArgument;
  swipeHistory: { limit?: number | null; nextToken?: string | null } & MediaTypeArgument;
  pendingMatch: MediaTypeArgument;
  swipe: { movieId: number; direction: SwipeDirection } & MediaTypeArgument;
  undoSwipe: { movieId: number } & MediaTypeArgument;
  updateFilters: { filters: Filters } & MediaTypeArgument;
  updateRoomSettings: { matchThreshold: number; requireMajority: boolean };
  joinRoom: { code: string };
  leaveRoom: Record<string, never>;
  startNewRound: { expectedRound: number } & MediaTypeArgument;
  updateProfile: { displayName?: string | null; avatarKey?: string | null };
  createAvatarUpload: { contentType: string };
  startPlexLink: Record<string, never>;
  confirmPlexLink: { code: string };
  unlinkPlex: Record<string, never>;
  requestOnPlex: { movieId: number } & MediaTypeArgument;
  publishRoomEvent: { input: RoomEventInput };
  revokeRoomSubscriptions: { roomId: string; userId: string };
  onRoomEvent: { roomId: string };
}

export type FieldName = keyof FieldArguments;
