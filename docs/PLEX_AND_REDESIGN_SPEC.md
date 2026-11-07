# Plex link and site redesign: build spec

Extends `docs/REWRITE_SPEC.md`. TMDB stays the catalogue: Radarr lookup is title
search only, with no genre, cast, provider, date or popularity browsing.

## Decisions from the owner

- Link proof: one-time emailed code.
- Plex filter: any linked member in a room unlocks it for the whole room.
- Plex Request may be changed and deployed. Requests follow its normal approval rules, so trusted users stay auto-approved.

## Plex Request changes (`~/source/plex_request`, branch `feat/movie-date-integration`)

Live with 11 real users. Deployed stack: `plex-request-api-devtest`, stage `devtest`.

- One new Lambda, `integration`, with no HTTP event. Only Movie Date's Lambda role may invoke it, by resource policy or IAM on the caller side. No new public endpoint.
- Operations, discriminated on `op`:
  - `findUser { email }`: exact, case-insensitive match in the Plex Request pool, returning `{ userId, email }` only for a CONFIRMED user with a verified email.
  - `libraryMovies {}`: `{ tmdbId, hasFile }[]` from the library table.
  - `movieStatus { tmdbId, userId }`: library state plus any active request.
  - `createRequest { userId, email, tmdbId, title, year, overview, posterPath }`: must run the same code as `POST /requests`, including the duplicate check, auto-approve and its fallback. Extract that logic into `lib/` and have both callers use it, with no behaviour change for the existing route.
- Validate input. Never return emails other than the one asked about, or any Radarr, Sonarr or SABnzbd settings.
- Existing tests and lint stay green. The deploy must preserve current config: the integration keys live in the settings table, but check what an empty deploy environment would change before deploying.

## Movie Date backend

Schema additions, owned by the backend builder and applied to `graphql/schema.graphql`:

```graphql
enum PlexAvailability { AVAILABLE MONITORED REQUESTED NOT_IN_LIBRARY }
type PlexStatus { availability: PlexAvailability!, canRequest: Boolean! }
type PlexLinkStart { sent: Boolean! }
# Profile: plexLinked: Boolean!
# Room: plexAvailable: Boolean!
# Query: plexStatus(movieId: Int!): PlexStatus
# Mutation:
#   startPlexLink: PlexLinkStart!
#   confirmPlexLink(code: String!): Profile!
#   unlinkPlex: Profile!
#   requestOnPlex(movieId: Int!): PlexStatus!
```

**Linking**

- Always offered in Profile. `startPlexLink` uses the caller's own profile email and answers `sent: true` whether or not a Plex Request account exists, so it can't be used to discover who has one. Only a real match sends mail.
- Mail goes through SES from `noreply@jpdxsolo.com`. 6-digit code from crypto randomness; only a salted hash is stored; 10-minute TTL; 5 attempts; one send per minute per user.
- `confirmPlexLink` stores the Plex Request `userId` on the profile, with an atomic attempt counter. The code is bound to the user who started it.
- Linking and unlinking publish `ROOM_UPDATED`.

**Library index**

- Scheduled Lambda every 6 hours, also runnable on demand, reads `libraryMovies`, and for ids it hasn't seen fetches `movie/{id}?append_to_response=credits`, storing a compact record: id, genre ids, top-billed cast ids, release date, popularity, hasFile.
- The index lives where the deck can read it in one go (S3 JSON or chunked DynamoDB rows). Removed titles drop out.
- Failures keep the last good index.

**Deck**

- `plex` is a new provider key in the catalogue, valid only when `Room.plexAvailable`. Without a linked member the key is ignored, not an error, so a member leaving doesn't empty the deck.
- Plex alone: filter the index by genre, cast and dates, sort by popularity, page it, hydrate cards through the normal cached path. Only `hasFile` titles count.
- Plex with other services: interleave Plex results with TMDB discover results, deduped, keeping the page and exclusion rules.

**Where to Watch and requests**

- `watchOptions` adds a Plex entry for rooms with `plexAvailable` when the title has a file. Every member sees it; there's no deep link.
- `plexStatus` is null for callers who aren't linked.
- `requestOnPlex` acts only as the caller's linked account. Limit 10 per user per day. A duplicate comes back as `REQUESTED`, not an error.
- If Plex Request can't be reached, Plex features degrade quietly: Movie Date keeps working and the UI says requests are unavailable.

## TV groundwork

`docs/GOING_STEADY_TV_PLAN.md` adds TV later. TMDB movie and TV ids overlap, so build this now: a `MediaType { MOVIE TV }` enum in the schema, and swipe, tally and match keys using `movie:<id>`. Only movies ship in this build; no TV UI or handlers.

## Plex UI

- Profile: Link Plex Request card with code entry, linked state, Unlink.
- Filters: a Plex option, with its own icon, only when `plexAvailable`.
- Detail sheet, match screen and history: Plex status badge and a Request on Plex button for linked users. Confirm before sending, because trusted users' requests start a download straight away.

## Site redesign

Mobile stays a first-class view with the same navigation model. Keep the identity: coral to amber gradient, black header, orange accent, full-bleed posters, "Watch Movie" and "Don't Watch" overlays. Improve freely within that. Avoid generic template looks; this should feel like a warm movie night.

**Desktop (from 1024px)**

- Persistent left sidebar replaces the drawer and bottom nav.
- Home is a three-part layout: the deck in the centre at a comfortable size; a details panel beside it that shows the top card's backdrop, trailer, overview, runtime, rating and Where to Watch without needing a tap; and the room panel with code, members, active filters and latest matches.
- Filters, History, Members, Profile and Settings get real desktop layouts rather than a stretched phone column.
- Keyboard shortcuts stay, with a discoverable hint. Hover and focus states everywhere.
- Tablet (640 to 1023px) gets a sensible middle layout.

**Filters rework**

- Replace the form of dialogs with direct controls: genre chips you tap in place, streaming service tiles with logos, actor search with inline autocomplete and removable face chips, and decade quick picks plus a from/to range in place of bare date boxes. Plain date entry stays reachable.
- A live "about N movies" count where TMDB's `total_results` allows it, with a sticky Apply bar. Add a schema field if needed, debounced.
- Active filter summary, individual removal, Clear All.
- Mobile: full-screen sheet with the sticky Apply bar. Desktop: two-column page with a live preview strip of posters.
- Date fields must never overlap at any width, including iOS Safari.

**Across the site**

- Consistent page headers and empty states, animated route transitions that respect reduced motion, skeletons shaped like the content, better toasts, tidier auth screens with a poster collage backdrop.
- Keep every existing feature, route and test intent. Update tests where markup changes on purpose; don't delete coverage.
