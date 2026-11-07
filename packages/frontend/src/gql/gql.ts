/* eslint-disable */
import * as types from './graphql';



/**
 * Map of all GraphQL operations in the project.
 *
 * This map has several performance disadvantages:
 * 1. It is not tree-shakeable, so it will include all operations in the project.
 * 2. It is not minifiable, so the string of a GraphQL query will be multiple times inside the bundle.
 * 3. It does not support dead code elimination, so it will add unused operations.
 *
 * Therefore it is highly recommended to use the babel or swc plugin for production.
 * Learn more about it here: https://the-guild.dev/graphql/codegen/plugins/presets/preset-client#reducing-bundle-size
 */
type Documents = {
    "\n  fragment ProfileFields on Profile {\n    id\n    email\n    displayName\n    avatarUrl\n    plexLinked\n  }\n": typeof types.ProfileFieldsFragmentDoc,
    "\n  fragment PlexStatusFields on PlexStatus {\n    availability\n    canRequest\n  }\n": typeof types.PlexStatusFieldsFragmentDoc,
    "\n  fragment PersonFields on Person {\n    id\n    name\n    profileUrl\n    knownForDepartment\n  }\n": typeof types.PersonFieldsFragmentDoc,
    "\n  fragment MemberFields on Member {\n    userId\n    displayName\n    avatarUrl\n    isMe\n  }\n": typeof types.MemberFieldsFragmentDoc,
    "\n  fragment RoomFields on Room {\n    id\n    code\n    matchThreshold\n    requireMajority\n    round\n    plexAvailable\n    filters {\n      genreIds\n      services\n      releaseDateGte\n      releaseDateLte\n      cast {\n        ...PersonFields\n      }\n    }\n    members {\n      ...MemberFields\n    }\n  }\n": typeof types.RoomFieldsFragmentDoc,
    "\n  fragment MovieFields on Movie {\n    id\n    title\n    overview\n    releaseYear\n    runtime\n    voteAverage\n    posterUrl\n    backdropUrl\n    genres\n  }\n": typeof types.MovieFieldsFragmentDoc,
    "\n  fragment MatchFields on Match {\n    id\n    roomId\n    round\n    matchedAt\n    movie {\n      ...MovieFields\n    }\n  }\n": typeof types.MatchFieldsFragmentDoc,
    "\n  fragment HistoryEntryFields on HistoryEntry {\n    direction\n    round\n    swipedAt\n    movie {\n      ...MovieFields\n    }\n  }\n": typeof types.HistoryEntryFieldsFragmentDoc,
    "\n  query Me {\n    me {\n      ...ProfileFields\n    }\n  }\n": typeof types.MeDocument,
    "\n  query MyRoom {\n    myRoom {\n      ...RoomFields\n    }\n  }\n": typeof types.MyRoomDocument,
    "\n  query Deck($page: Int!) {\n    deck(page: $page) {\n      nextPage\n      cards {\n        likedByRoommate\n        movie {\n          ...MovieFields\n        }\n      }\n    }\n  }\n": typeof types.DeckDocument,
    "\n  query FilterPreview($filters: FiltersInput!) {\n    filterPreview(filters: $filters) {\n      totalResults\n      posterUrls\n    }\n  }\n": typeof types.FilterPreviewDocument,
    "\n  query Movie($id: Int!) {\n    movie(id: $id) {\n      ...MovieFields\n    }\n  }\n": typeof types.MovieDocument,
    "\n  query Trailer($movieId: Int!) {\n    trailer(movieId: $movieId)\n  }\n": typeof types.TrailerDocument,
    "\n  query WatchOptions($movieId: Int!) {\n    watchOptions(movieId: $movieId) {\n      serviceId\n      serviceName\n      type\n      link\n      logoUrl\n    }\n  }\n": typeof types.WatchOptionsDocument,
    "\n  query PlexStatus($movieId: Int!) {\n    plexStatus(movieId: $movieId) {\n      ...PlexStatusFields\n    }\n  }\n": typeof types.PlexStatusDocument,
    "\n  query Genres {\n    genres {\n      id\n      name\n    }\n  }\n": typeof types.GenresDocument,
    "\n  query SearchPeople($query: String!) {\n    searchPeople(query: $query) {\n      ...PersonFields\n    }\n  }\n": typeof types.SearchPeopleDocument,
    "\n  query Matches($limit: Int, $nextToken: String) {\n    matches(limit: $limit, nextToken: $nextToken) {\n      nextToken\n      matches {\n        ...MatchFields\n      }\n    }\n  }\n": typeof types.MatchesDocument,
    "\n  query SwipeHistory($limit: Int, $nextToken: String) {\n    swipeHistory(limit: $limit, nextToken: $nextToken) {\n      nextToken\n      entries {\n        ...HistoryEntryFields\n      }\n    }\n  }\n": typeof types.SwipeHistoryDocument,
    "\n  query PendingMatch {\n    pendingMatch {\n      ...MatchFields\n    }\n  }\n": typeof types.PendingMatchDocument,
    "\n  mutation Swipe($movieId: Int!, $direction: SwipeDirection!) {\n    swipe(movieId: $movieId, direction: $direction) {\n      movieId\n      direction\n      match {\n        ...MatchFields\n      }\n    }\n  }\n": typeof types.SwipeDocument,
    "\n  mutation UndoSwipe($movieId: Int!) {\n    undoSwipe(movieId: $movieId) {\n      movieId\n      undone\n    }\n  }\n": typeof types.UndoSwipeDocument,
    "\n  mutation UpdateFilters($filters: FiltersInput!) {\n    updateFilters(filters: $filters) {\n      ...RoomFields\n    }\n  }\n": typeof types.UpdateFiltersDocument,
    "\n  mutation UpdateRoomSettings($matchThreshold: Int!, $requireMajority: Boolean!) {\n    updateRoomSettings(matchThreshold: $matchThreshold, requireMajority: $requireMajority) {\n      ...RoomFields\n    }\n  }\n": typeof types.UpdateRoomSettingsDocument,
    "\n  mutation JoinRoom($code: String!) {\n    joinRoom(code: $code) {\n      ...RoomFields\n    }\n  }\n": typeof types.JoinRoomDocument,
    "\n  mutation LeaveRoom {\n    leaveRoom {\n      ...RoomFields\n    }\n  }\n": typeof types.LeaveRoomDocument,
    "\n  mutation StartNewRound($expectedRound: Int!) {\n    startNewRound(expectedRound: $expectedRound) {\n      ...RoomFields\n    }\n  }\n": typeof types.StartNewRoundDocument,
    "\n  mutation UpdateProfile($displayName: String, $avatarKey: String) {\n    updateProfile(displayName: $displayName, avatarKey: $avatarKey) {\n      ...ProfileFields\n    }\n  }\n": typeof types.UpdateProfileDocument,
    "\n  mutation CreateAvatarUpload($contentType: String!) {\n    createAvatarUpload(contentType: $contentType) {\n      url\n      fields\n      key\n    }\n  }\n": typeof types.CreateAvatarUploadDocument,
    "\n  mutation StartPlexLink {\n    startPlexLink {\n      sent\n    }\n  }\n": typeof types.StartPlexLinkDocument,
    "\n  mutation ConfirmPlexLink($code: String!) {\n    confirmPlexLink(code: $code) {\n      ...ProfileFields\n    }\n  }\n": typeof types.ConfirmPlexLinkDocument,
    "\n  mutation UnlinkPlex {\n    unlinkPlex {\n      ...ProfileFields\n    }\n  }\n": typeof types.UnlinkPlexDocument,
    "\n  mutation RequestOnPlex($movieId: Int!) {\n    requestOnPlex(movieId: $movieId) {\n      ...PlexStatusFields\n    }\n  }\n": typeof types.RequestOnPlexDocument,
    "\n  subscription OnRoomEvent($roomId: ID!) {\n    onRoomEvent(roomId: $roomId) {\n      roomId\n      type\n      movieId\n      matchId\n      round\n      actorId\n    }\n  }\n": typeof types.OnRoomEventDocument,
};
const documents: Documents = {
    "\n  fragment ProfileFields on Profile {\n    id\n    email\n    displayName\n    avatarUrl\n    plexLinked\n  }\n": types.ProfileFieldsFragmentDoc,
    "\n  fragment PlexStatusFields on PlexStatus {\n    availability\n    canRequest\n  }\n": types.PlexStatusFieldsFragmentDoc,
    "\n  fragment PersonFields on Person {\n    id\n    name\n    profileUrl\n    knownForDepartment\n  }\n": types.PersonFieldsFragmentDoc,
    "\n  fragment MemberFields on Member {\n    userId\n    displayName\n    avatarUrl\n    isMe\n  }\n": types.MemberFieldsFragmentDoc,
    "\n  fragment RoomFields on Room {\n    id\n    code\n    matchThreshold\n    requireMajority\n    round\n    plexAvailable\n    filters {\n      genreIds\n      services\n      releaseDateGte\n      releaseDateLte\n      cast {\n        ...PersonFields\n      }\n    }\n    members {\n      ...MemberFields\n    }\n  }\n": types.RoomFieldsFragmentDoc,
    "\n  fragment MovieFields on Movie {\n    id\n    title\n    overview\n    releaseYear\n    runtime\n    voteAverage\n    posterUrl\n    backdropUrl\n    genres\n  }\n": types.MovieFieldsFragmentDoc,
    "\n  fragment MatchFields on Match {\n    id\n    roomId\n    round\n    matchedAt\n    movie {\n      ...MovieFields\n    }\n  }\n": types.MatchFieldsFragmentDoc,
    "\n  fragment HistoryEntryFields on HistoryEntry {\n    direction\n    round\n    swipedAt\n    movie {\n      ...MovieFields\n    }\n  }\n": types.HistoryEntryFieldsFragmentDoc,
    "\n  query Me {\n    me {\n      ...ProfileFields\n    }\n  }\n": types.MeDocument,
    "\n  query MyRoom {\n    myRoom {\n      ...RoomFields\n    }\n  }\n": types.MyRoomDocument,
    "\n  query Deck($page: Int!) {\n    deck(page: $page) {\n      nextPage\n      cards {\n        likedByRoommate\n        movie {\n          ...MovieFields\n        }\n      }\n    }\n  }\n": types.DeckDocument,
    "\n  query FilterPreview($filters: FiltersInput!) {\n    filterPreview(filters: $filters) {\n      totalResults\n      posterUrls\n    }\n  }\n": types.FilterPreviewDocument,
    "\n  query Movie($id: Int!) {\n    movie(id: $id) {\n      ...MovieFields\n    }\n  }\n": types.MovieDocument,
    "\n  query Trailer($movieId: Int!) {\n    trailer(movieId: $movieId)\n  }\n": types.TrailerDocument,
    "\n  query WatchOptions($movieId: Int!) {\n    watchOptions(movieId: $movieId) {\n      serviceId\n      serviceName\n      type\n      link\n      logoUrl\n    }\n  }\n": types.WatchOptionsDocument,
    "\n  query PlexStatus($movieId: Int!) {\n    plexStatus(movieId: $movieId) {\n      ...PlexStatusFields\n    }\n  }\n": types.PlexStatusDocument,
    "\n  query Genres {\n    genres {\n      id\n      name\n    }\n  }\n": types.GenresDocument,
    "\n  query SearchPeople($query: String!) {\n    searchPeople(query: $query) {\n      ...PersonFields\n    }\n  }\n": types.SearchPeopleDocument,
    "\n  query Matches($limit: Int, $nextToken: String) {\n    matches(limit: $limit, nextToken: $nextToken) {\n      nextToken\n      matches {\n        ...MatchFields\n      }\n    }\n  }\n": types.MatchesDocument,
    "\n  query SwipeHistory($limit: Int, $nextToken: String) {\n    swipeHistory(limit: $limit, nextToken: $nextToken) {\n      nextToken\n      entries {\n        ...HistoryEntryFields\n      }\n    }\n  }\n": types.SwipeHistoryDocument,
    "\n  query PendingMatch {\n    pendingMatch {\n      ...MatchFields\n    }\n  }\n": types.PendingMatchDocument,
    "\n  mutation Swipe($movieId: Int!, $direction: SwipeDirection!) {\n    swipe(movieId: $movieId, direction: $direction) {\n      movieId\n      direction\n      match {\n        ...MatchFields\n      }\n    }\n  }\n": types.SwipeDocument,
    "\n  mutation UndoSwipe($movieId: Int!) {\n    undoSwipe(movieId: $movieId) {\n      movieId\n      undone\n    }\n  }\n": types.UndoSwipeDocument,
    "\n  mutation UpdateFilters($filters: FiltersInput!) {\n    updateFilters(filters: $filters) {\n      ...RoomFields\n    }\n  }\n": types.UpdateFiltersDocument,
    "\n  mutation UpdateRoomSettings($matchThreshold: Int!, $requireMajority: Boolean!) {\n    updateRoomSettings(matchThreshold: $matchThreshold, requireMajority: $requireMajority) {\n      ...RoomFields\n    }\n  }\n": types.UpdateRoomSettingsDocument,
    "\n  mutation JoinRoom($code: String!) {\n    joinRoom(code: $code) {\n      ...RoomFields\n    }\n  }\n": types.JoinRoomDocument,
    "\n  mutation LeaveRoom {\n    leaveRoom {\n      ...RoomFields\n    }\n  }\n": types.LeaveRoomDocument,
    "\n  mutation StartNewRound($expectedRound: Int!) {\n    startNewRound(expectedRound: $expectedRound) {\n      ...RoomFields\n    }\n  }\n": types.StartNewRoundDocument,
    "\n  mutation UpdateProfile($displayName: String, $avatarKey: String) {\n    updateProfile(displayName: $displayName, avatarKey: $avatarKey) {\n      ...ProfileFields\n    }\n  }\n": types.UpdateProfileDocument,
    "\n  mutation CreateAvatarUpload($contentType: String!) {\n    createAvatarUpload(contentType: $contentType) {\n      url\n      fields\n      key\n    }\n  }\n": types.CreateAvatarUploadDocument,
    "\n  mutation StartPlexLink {\n    startPlexLink {\n      sent\n    }\n  }\n": types.StartPlexLinkDocument,
    "\n  mutation ConfirmPlexLink($code: String!) {\n    confirmPlexLink(code: $code) {\n      ...ProfileFields\n    }\n  }\n": types.ConfirmPlexLinkDocument,
    "\n  mutation UnlinkPlex {\n    unlinkPlex {\n      ...ProfileFields\n    }\n  }\n": types.UnlinkPlexDocument,
    "\n  mutation RequestOnPlex($movieId: Int!) {\n    requestOnPlex(movieId: $movieId) {\n      ...PlexStatusFields\n    }\n  }\n": types.RequestOnPlexDocument,
    "\n  subscription OnRoomEvent($roomId: ID!) {\n    onRoomEvent(roomId: $roomId) {\n      roomId\n      type\n      movieId\n      matchId\n      round\n      actorId\n    }\n  }\n": types.OnRoomEventDocument,
};

/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment ProfileFields on Profile {\n    id\n    email\n    displayName\n    avatarUrl\n    plexLinked\n  }\n"): typeof import('./graphql').ProfileFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment PlexStatusFields on PlexStatus {\n    availability\n    canRequest\n  }\n"): typeof import('./graphql').PlexStatusFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment PersonFields on Person {\n    id\n    name\n    profileUrl\n    knownForDepartment\n  }\n"): typeof import('./graphql').PersonFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment MemberFields on Member {\n    userId\n    displayName\n    avatarUrl\n    isMe\n  }\n"): typeof import('./graphql').MemberFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment RoomFields on Room {\n    id\n    code\n    matchThreshold\n    requireMajority\n    round\n    plexAvailable\n    filters {\n      genreIds\n      services\n      releaseDateGte\n      releaseDateLte\n      cast {\n        ...PersonFields\n      }\n    }\n    members {\n      ...MemberFields\n    }\n  }\n"): typeof import('./graphql').RoomFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment MovieFields on Movie {\n    id\n    title\n    overview\n    releaseYear\n    runtime\n    voteAverage\n    posterUrl\n    backdropUrl\n    genres\n  }\n"): typeof import('./graphql').MovieFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment MatchFields on Match {\n    id\n    roomId\n    round\n    matchedAt\n    movie {\n      ...MovieFields\n    }\n  }\n"): typeof import('./graphql').MatchFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  fragment HistoryEntryFields on HistoryEntry {\n    direction\n    round\n    swipedAt\n    movie {\n      ...MovieFields\n    }\n  }\n"): typeof import('./graphql').HistoryEntryFieldsFragmentDoc;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Me {\n    me {\n      ...ProfileFields\n    }\n  }\n"): typeof import('./graphql').MeDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query MyRoom {\n    myRoom {\n      ...RoomFields\n    }\n  }\n"): typeof import('./graphql').MyRoomDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Deck($page: Int!) {\n    deck(page: $page) {\n      nextPage\n      cards {\n        likedByRoommate\n        movie {\n          ...MovieFields\n        }\n      }\n    }\n  }\n"): typeof import('./graphql').DeckDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query FilterPreview($filters: FiltersInput!) {\n    filterPreview(filters: $filters) {\n      totalResults\n      posterUrls\n    }\n  }\n"): typeof import('./graphql').FilterPreviewDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Movie($id: Int!) {\n    movie(id: $id) {\n      ...MovieFields\n    }\n  }\n"): typeof import('./graphql').MovieDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Trailer($movieId: Int!) {\n    trailer(movieId: $movieId)\n  }\n"): typeof import('./graphql').TrailerDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query WatchOptions($movieId: Int!) {\n    watchOptions(movieId: $movieId) {\n      serviceId\n      serviceName\n      type\n      link\n      logoUrl\n    }\n  }\n"): typeof import('./graphql').WatchOptionsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PlexStatus($movieId: Int!) {\n    plexStatus(movieId: $movieId) {\n      ...PlexStatusFields\n    }\n  }\n"): typeof import('./graphql').PlexStatusDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Genres {\n    genres {\n      id\n      name\n    }\n  }\n"): typeof import('./graphql').GenresDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SearchPeople($query: String!) {\n    searchPeople(query: $query) {\n      ...PersonFields\n    }\n  }\n"): typeof import('./graphql').SearchPeopleDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query Matches($limit: Int, $nextToken: String) {\n    matches(limit: $limit, nextToken: $nextToken) {\n      nextToken\n      matches {\n        ...MatchFields\n      }\n    }\n  }\n"): typeof import('./graphql').MatchesDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query SwipeHistory($limit: Int, $nextToken: String) {\n    swipeHistory(limit: $limit, nextToken: $nextToken) {\n      nextToken\n      entries {\n        ...HistoryEntryFields\n      }\n    }\n  }\n"): typeof import('./graphql').SwipeHistoryDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  query PendingMatch {\n    pendingMatch {\n      ...MatchFields\n    }\n  }\n"): typeof import('./graphql').PendingMatchDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation Swipe($movieId: Int!, $direction: SwipeDirection!) {\n    swipe(movieId: $movieId, direction: $direction) {\n      movieId\n      direction\n      match {\n        ...MatchFields\n      }\n    }\n  }\n"): typeof import('./graphql').SwipeDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UndoSwipe($movieId: Int!) {\n    undoSwipe(movieId: $movieId) {\n      movieId\n      undone\n    }\n  }\n"): typeof import('./graphql').UndoSwipeDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateFilters($filters: FiltersInput!) {\n    updateFilters(filters: $filters) {\n      ...RoomFields\n    }\n  }\n"): typeof import('./graphql').UpdateFiltersDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateRoomSettings($matchThreshold: Int!, $requireMajority: Boolean!) {\n    updateRoomSettings(matchThreshold: $matchThreshold, requireMajority: $requireMajority) {\n      ...RoomFields\n    }\n  }\n"): typeof import('./graphql').UpdateRoomSettingsDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation JoinRoom($code: String!) {\n    joinRoom(code: $code) {\n      ...RoomFields\n    }\n  }\n"): typeof import('./graphql').JoinRoomDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation LeaveRoom {\n    leaveRoom {\n      ...RoomFields\n    }\n  }\n"): typeof import('./graphql').LeaveRoomDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation StartNewRound($expectedRound: Int!) {\n    startNewRound(expectedRound: $expectedRound) {\n      ...RoomFields\n    }\n  }\n"): typeof import('./graphql').StartNewRoundDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UpdateProfile($displayName: String, $avatarKey: String) {\n    updateProfile(displayName: $displayName, avatarKey: $avatarKey) {\n      ...ProfileFields\n    }\n  }\n"): typeof import('./graphql').UpdateProfileDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation CreateAvatarUpload($contentType: String!) {\n    createAvatarUpload(contentType: $contentType) {\n      url\n      fields\n      key\n    }\n  }\n"): typeof import('./graphql').CreateAvatarUploadDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation StartPlexLink {\n    startPlexLink {\n      sent\n    }\n  }\n"): typeof import('./graphql').StartPlexLinkDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation ConfirmPlexLink($code: String!) {\n    confirmPlexLink(code: $code) {\n      ...ProfileFields\n    }\n  }\n"): typeof import('./graphql').ConfirmPlexLinkDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation UnlinkPlex {\n    unlinkPlex {\n      ...ProfileFields\n    }\n  }\n"): typeof import('./graphql').UnlinkPlexDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  mutation RequestOnPlex($movieId: Int!) {\n    requestOnPlex(movieId: $movieId) {\n      ...PlexStatusFields\n    }\n  }\n"): typeof import('./graphql').RequestOnPlexDocument;
/**
 * The graphql function is used to parse GraphQL queries into a document that can be used by GraphQL clients.
 */
export function graphql(source: "\n  subscription OnRoomEvent($roomId: ID!) {\n    onRoomEvent(roomId: $roomId) {\n      roomId\n      type\n      movieId\n      matchId\n      round\n      actorId\n    }\n  }\n"): typeof import('./graphql').OnRoomEventDocument;


export function graphql(source: string) {
  return (documents as Record<string, unknown>)[source] ?? {};
}
