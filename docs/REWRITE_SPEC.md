# Movie Date web rewrite: build spec

Replaces the Flutter + Supabase mobile app with a hosted, mobile-first website.
`graphql/schema.graphql` is the API contract. The Flutter source in `lib/` is the
reference for behaviour and look until it is removed at the end of the rewrite.

## Stack

Mirrors `~/source/know-it-owl` (read it for patterns; don't copy its domain).

- npm workspaces: `packages/core`, `packages/functions`, `packages/frontend`, `packages/test`
- SST v3 (`sst` 4.17.1 pinned), AWS `us-east-1`, profile `league-szn` (`AWS_PROFILE`), app name `movie-date`, stage `production`
- AppSync + one Lambda resolver + DynamoDB single table + S3 avatars + Cognito + CloudFront static site on its default URL
- React 18 + TypeScript + Vite + react-router-dom 6; PWA via `vite-plugin-pwa`
- Tests: vitest in `packages/test`, mirroring the source tree; `aws-sdk-client-mock`; Testing Library
- No `any`. Functional components. Plain CSS files per component, tokens in one stylesheet. No inline styles except values computed per frame (drag transforms).

## Secrets

TMDB and RapidAPI keys are already in SSM as SecureStrings:
`/movie-date/production/tmdb-api-key`, `/movie-date/production/rapidapi-key`.
The Lambda reads them at cold start and caches them. Its environment holds only the
parameter names; the role gets `ssm:GetParameter` on those two plus the KMS decrypt
SSM needs. Keys never reach the browser, SST state or the repo. The old YouTube key
hardcoded in `lib/repositories/youtube_repository.dart` is NOT used.

## Auth

- New Cognito user pool `movie-date-production`, email as username, password minimum 6 with no character rules (matches the old validator), self sign-up on, SPA client with no secret, SRP + refresh.
- PreSignUp Lambda trigger sets autoConfirm and autoVerifyEmail: sign-up logs straight in as it did before, and forgot-password still works.
- Frontend uses `amazon-cognito-identity-js`. Screens: login, register, forgot password (code, new password).
- AppSync default auth is Cognito user pools; IAM is the additional provider, for `publishRoomEvent` only. No API key.
- Every handler takes the user from `event.identity.sub`, never from arguments.
- Don't trust client claims about room membership: the room is always looked up from the caller's profile.

## Data model (single table, `pk`/`sk`, TTL attribute `expiresAt`)

| pk | sk | Attributes |
|---|---|---|
| `USER#<sub>` | `PROFILE` | email, displayName, avatarKey, roomId, createdAt |
| `ROOM#<id>` | `META` | code, filters, matchThreshold, requireMajority, round, createdAt |
| `ROOM#<id>` | `MEMBER#<sub>` | joinedAt |
| `ROOM#<id>` | `SWIPE#<round>#<sub>#<movieId>` | direction, swipedAt, movie snapshot |
| `ROOM#<id>` | `TALLY#<round>#<movieId>` | likes (atomic counter), movie snapshot |
| `ROOM#<id>` | `MATCH#<matchedAt>#<movieId>` | round, movieId, movie snapshot, matchId |
| `ROOM#<id>` | `MATCHED#<round>#<movieId>` | sentinel making a match exactly-once; holds matchId and match sk |
| `CODE#<code>` | `ROOM` | roomId (conditional put guarantees uniqueness) |
| `CACHE#<kind>#<key>` | `CACHE` | value, expiresAt |

The caller's swipe history in a room is a query on `SWIPE#` filtered to their sub,
sorted newest first in the handler, paging via an opaque base64 token.
Use a GSI only if a handler truly needs one.

## Behaviour

Defaults match the Flutter app. The items under "Deliberate fixes" are intentional changes.

- **First login**: `me` lazily creates the profile (displayName defaults to the email's local part) and a room. New room: 6-character code from an unambiguous uppercase alphabet using crypto randomness; threshold 2; no filters; round 1.
- **Deck**: TMDB `discover/movie` with language `en`, `sort_by=popularity.desc`, `include_adult=false`; genres pipe-joined (OR), cast pipe-joined (OR), providers pipe-joined with `watch_region=US`, `primary_release_date.gte/lte`. Drop results whose `original_language` isn't `en`, as the old app did. Hydrate each with `movie/{id}` for runtime. Exclude anything the caller already swiped this round. If a page empties after exclusion, walk forward up to 5 TMDB pages. Liked-by-roommate movies not yet swiped by the caller go at the head of page 1, flagged `likedByRoommate`, ignoring filters (they already passed someone's filters).
- **Posters**: `https://image.tmdb.org/t/p/w780` poster, `w1280` backdrop.
- **Provider catalogue** in `packages/core` keyed by service: any(none), tubi 73, prime 9, netflix 8, hulu 15, hbo 1899, apple 350, disney 337, paramount 531|1770|1853, peacock 386. Labels and icons from `lib/utils/constants.dart`; icons from `assets/icons`.
- **Filters page**: Search defaults the start date to Jan 1 of the current year when none is picked, as the old app did. Clear Filters empties the form. Saving publishes `ROOM_UPDATED` so everyone's deck reloads.
- **Swipe**: one transaction puts the swipe (`attribute_not_exists`, so repeats are no-ops) and for LIKE does `ADD likes 1` on the tally. A consistent read follows; at `likes >= matchThreshold` a conditional put of `MATCHED#` picks the single winner, which writes `MATCH#` and publishes `MATCH_FOUND`.
- **Threshold**: minimum 2, slider max is member count (at least 2). Require Majority sets `max(2, ceil(members/2))` and stays in effect as members change. Lowering the threshold or a member change re-evaluates tallies for new matches.
- **Undo**: removes the caller's swipe in the current round, decrements the tally for LIKE. Refused (`undone: false`) if that movie already matched.
- **Join**: normalise the code; unknown code gives the error `Invalid room code`. Leaving a room removes the caller's current-round swipes and their tally contributions. Publishes `MEMBERS_CHANGED` on both rooms. Rejoining the same room is a no-op.
- **Leave Room**: as above, then a fresh room for the caller.
- **Match screen**: anyone in the room is routed to it on `MATCH_FOUND`, and on load via `pendingMatch` if they missed the event. Shows poster, title, year, runtime, rating, overview, Where to Watch, Back to Start.
- **Back to Start** = `startNewRound(expectedRound)`: conditional increment, publishes `ROUND_RESET`. History is kept. Members on the match screen stay until they press the button themselves; if the round already advanced it just takes them home.
- **Where to Watch**: RapidAPI `streaming-availability` `/shows/movie/{tmdbId}?country=us&output_language=en`, reading `streamingOptions.us`, one entry per service, with deep links. If the key is missing or the call fails, fall back to TMDB `movie/{id}/watch/providers` (US) and show the required JustWatch attribution. Cache 24h in DynamoDB.
- **Trailers**: TMDB `movie/{id}/videos`: official YouTube Trailer first, then any Trailer, then Teaser. Embed from `youtube-nocookie.com`. Cache 7 days.
- **Caching**: genres 7 days, movie details 7 days, watch options 24h.
- **Avatars**: `createPresignedPost` to S3 with `content-length-range` up to 5 MB and fixed `Content-Type` in `image/jpeg|png|webp`, key `avatars/<sub>/<uuid>`. The browser centre-crops and resizes to 512px JPEG first. `updateProfile` only accepts a key under the caller's own prefix. Served publicly from the bucket URL.
- **Subscription**: Lambda resolver on `Subscription.onRoomEvent` rejects non-members. Lambda publishes by SigV4-signing `publishRoomEvent` to the AppSync URL, selecting every `RoomEvent` field (subscribers only receive fields the mutation selected). Publish failures log but never fail the caller's swipe. Clients also refetch `pendingMatch` on reconnect and on tab focus.

## Deliberate fixes to old behaviour

1. Realtime match check was hardcoded to 2; the room's threshold now applies everywhere.
2. Match count was read-then-write and could lose concurrent swipes; now atomic.
3. Paramount+ ids were comma-joined, which TMDB treats as AND; now OR.
4. Genre labels on a card lagged one swipe behind; each card now carries its own.
5. `isLoop: true` re-showed the same deck forever; there's now a real end-of-deck state.
6. Realtime channels delivered every room's rows to every client; events are now room-scoped and membership-checked.
7. Member lists exposed emails; `Member` carries only display name and avatar.
8. Leave Room overwrote the caller's email with an empty string; gone.
9. A departed member's likes kept counting toward matches; they're now removed.
10. Back to Start deleted only your swipes but everyone's tallies, so tallies and swipes disagreed; a round now resets cleanly.
11. API keys were bundled in the client; all third-party calls are now server-side.

## New features

- Pass, Like and Undo buttons under the deck; keyboard `←` `→` `Backspace` on desktop. Undo is one level per swipe, walking back through the session's stack.
- Match history page and swipe history page, with Where to Watch on any past match.
- Invite link `/join/:code` with Web Share and a QR code. Signed-out visitors go through login and return. If already in another room, confirm first.
- Installable PWA: manifest, icons from `assets/movieDate.png`, standalone display, app shell cached, API never cached, updates apply on next load. Safe-area insets respected.
- Forgot password.
- Liked-by-roommate cards surface first with a small badge, so matches happen sooner.
- Member list and toasts update live on `MEMBERS_CHANGED`.

## Look

Keep the identity:

- Coral to amber gradient `#FF5F6D` to `#FFC371` behind the deck and match screens.
- Black app bar, bold white centred "Movie Date" title; drawer menu; bottom nav with Home, Join Room, Search (Search opens Filters).
- Orange accent, 12px rounded fields, full-bleed poster cards with a bottom scrim, title + year, genres, runtime and rating, 3-line overview.
- Swipe overlays "Watch Movie" in green, "Don't Watch" in red, past 20% drag.
- Tap a card for the bottom sheet: trailer, poster, details, overview.
- Drawer: Log Out, Home, Profile, Room Members, Tutorial, Settings, plus new History; version at the bottom.

Improve the rough edges: real loading skeletons, friendly empty and error states with retry, focus states and labels, `prefers-reduced-motion`, 44px touch targets, `100dvh` so mobile browser chrome doesn't clip the deck. On wide screens centre the phone-width column over the gradient; don't stretch cards. Touch dragging must not scroll the page.

Tutorial: first-run walkthrough of swipe, room code, Join Room, Search, using `localStorage` `hasSeenTutorial`; reopenable from the drawer. See `lib/pages/swipe_page_tutorial.dart`.

TMDB attribution ("This product uses the TMDB API but is not endorsed or certified by TMDB") goes in the drawer footer.
