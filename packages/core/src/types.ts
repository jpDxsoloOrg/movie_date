/**
 * Domain types mirroring graphql/schema.graphql. A nullable GraphQL field is
 * `T | null` on output types and optional on input types, because AppSync omits
 * unset input fields rather than sending null.
 */

export type SwipeDirection = "LIKE" | "PASS";

export type RoomEventType =
  | "MATCH_FOUND"
  | "ROOM_UPDATED"
  | "MEMBERS_CHANGED"
  | "ROUND_RESET";

export type WatchOptionType = "subscription" | "free" | "rent" | "buy" | "addon";

export interface Profile {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
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
}

export interface Room {
  id: string;
  code: string;
  filters: Filters;
  matchThreshold: number;
  requireMajority: boolean;
  round: number;
  members: Member[];
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

export interface DeckCard {
  movie: Movie;
  likedByRoommate: boolean;
}

export interface DeckPage {
  cards: DeckCard[];
  nextPage: number | null;
}

export interface Match {
  id: string;
  roomId: string;
  round: number;
  matchedAt: string;
  movie: Movie;
}

export interface SwipeResult {
  movieId: number;
  direction: SwipeDirection;
  match: Match | null;
}

export interface UndoResult {
  movieId: number;
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
  movie: Movie;
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
  matchId: string | null;
  round: number | null;
  actorId: string | null;
}

export interface RoomEventInput {
  roomId: string;
  type: RoomEventType;
  movieId?: number | null;
  matchId?: string | null;
  round?: number | null;
  actorId?: string | null;
}

/** Arguments of every API field, keyed by field name. */
export interface FieldArguments {
  me: Record<string, never>;
  myRoom: Record<string, never>;
  deck: { page: number };
  movie: { id: number };
  trailer: { movieId: number };
  watchOptions: { movieId: number };
  genres: Record<string, never>;
  searchPeople: { query: string };
  matches: { limit?: number | null; nextToken?: string | null };
  swipeHistory: { limit?: number | null; nextToken?: string | null };
  pendingMatch: Record<string, never>;
  swipe: { movieId: number; direction: SwipeDirection };
  undoSwipe: { movieId: number };
  updateFilters: { filters: Filters };
  updateRoomSettings: { matchThreshold: number; requireMajority: boolean };
  joinRoom: { code: string };
  leaveRoom: Record<string, never>;
  startNewRound: { expectedRound: number };
  updateProfile: { displayName?: string | null; avatarKey?: string | null };
  createAvatarUpload: { contentType: string };
  publishRoomEvent: { input: RoomEventInput };
  revokeRoomSubscriptions: { roomId: string; userId: string };
  onRoomEvent: { roomId: string };
}

export type FieldName = keyof FieldArguments;
