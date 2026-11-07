# Going Steady: TV show swiping plan

Status: approved, to be built after `docs/PLEX_AND_REDESIGN_SPEC.md`.

## The idea

A movie is a date. A series is a commitment. **Going Steady** is the TV side of
Movie Date: the same people, in the same room, swiping left and right to find
a show to start together.

The name carries through the copy:

| Place | Movies | Going Steady |
|---|---|---|
| Swipe right | Watch Movie | Go Steady |
| Swipe left | Don't Watch | Just Friends |
| Match headline | Match Found / Your Movie Tonight! | It's Official / Your Next Show! |
| Back to Start | Back to Start | Keep Looking |

## Look

Going Steady gets its own color scheme so you always know which mode you're in. Movies stay warm: coral to amber, orange accent. Going Steady goes cool, like the room after the lights go down: deep indigo `#2E2A7A` to teal `#14A3A8` behind the deck and match screens, with a teal accent. The black header, layout and components stay shared. It's driven by one set of mode tokens, so the swap is a theme change and not a second stylesheet. All text must pass contrast on both themes.

## How it fits

Going Steady is a mode of the existing app, not a second app.

**Shared:** account, room, room code, members, match threshold, realtime, avatar, Plex link, and all the screens.

**Separate per mode:** deck, filters, swipes, matches and round. Going Steady has its own "Back to Start", so finishing a show search never resets the movie deck.

**Navigation**

- A **Going Steady** link in the drawer (mobile) and sidebar (desktop), as requested.
- A small Movies | Shows switch at the top of Home, so moving between them doesn't need the menu.
- Routes: `/shows`, `/shows/filters`, `/shows/match/:matchId`. History gains a Movies / Shows toggle.
- Members can be in different modes at once. Each person's last mode is remembered on their device.
- A match in the mode you're in takes you to the match screen, as it does today. A match in the other mode shows a banner with a View button, so nobody is pulled out of a swipe.

## What changes

### Data and API

- **TV and movie ids overlap in TMDB**, so the id alone can't identify a title. Swipe, tally and match keys become `movie:550` and `tv:1399`, and the schema gains `MediaType { MOVIE TV }`.
  - This is free now and painful later, so it goes into the current Plex and redesign build, while there are no real users.
- `deck`, `swipe`, `undoSwipe`, `matches`, `swipeHistory`, `pendingMatch`, `startNewRound` and `trailer` take a `mediaType`.
- `Room` gains `tvFilters` and `tvRound`.
- A `Show` type sits beside `Movie`, with first and last air year, status, season and episode counts, networks, and typical episode length.

**How cards and matches carry a title.** `DeckCard`, `Match` and `HistoryEntry` each have `mediaType`, `movie` and `show`.

- `movie` is always set. For a show it's `showAsMovie(show)` from `packages/core`, so shared UI reads `card.movie.title`, `.posterUrl` and so on in both modes with no branching.
- `show` is null for movies. Read it only for what a movie lacks: the `2019–2023 · 4 seasons · Ended` line and networks.
- **`movie.id` on a show is a TV id.** Every `api` call takes a trailing `mediaType`; pass `card.mediaType` or the current mode. Leaving it out means MOVIE, which quietly fetches a different title.
- Filters: `Room.filters` and `Room.tvFilters` are the same `Filters` type, and `FiltersInput` gained the TV fields, so one form serves both. Movies use the release dates and shows use `firstAirDate*`, `showStatus` and `commitment`. Season ranges are `COMMITMENT_SEASONS` in core.
- `RoomEvent.mediaType` says which mode a match or reset belongs to. Null means the event concerns the whole room. `updateFilters` sets it on `ROOM_UPDATED`.
- Partial on Plex is `AVAILABLE` with a non-empty `PlexStatus.missingSeasons`. `canRequest` stays false for shows in this build.

**Reading rows.** Every keyed row in the live table is a bare id, with no `movie:` rows yet, so take the mode from `mediaRefOfSk(sk)` and never from a `movie:` key prefix. `round` and `tvRound` are separate counters whose numbers overlap, so a `SWIPE#3#`, `TALLY#3#` or `MATCHED#3#` scan returns both modes: filter it. Existing rooms have no `tvRound` or `tvFilters` attribute, which reads as round 1 and empty filters, so writes and condition checks must allow for the attribute being absent.

### TMDB, checked against the live API

| Need | Source | Note |
|---|---|---|
| Deck | `discover/tv` | Genres, providers, first-air dates and popularity work the same way |
| Genres | `genre/tv/list` | A different list from movies, e.g. Sci-Fi & Fantasy |
| Actor filter | `person/{id}/tv_credits` | **`discover/tv` silently ignores `with_cast`** (same 20,001 results with or without it), so this needs its own path, intersecting credits with the other filters |
| Details | `tv/{id}` | `episode_run_time` is often empty, so length needs a fallback or gets hidden |
| Trailer | `tv/{id}/videos` | Same ranking as movies |
| Plex and Sonarr id | `tv/{id}/external_ids` | Gives the TVDB id; cache it |

Where to Watch: RapidAPI should work through `/shows/tv/{id}`, but that path is untested. The TMDB fallback becomes `tv/{id}/watch/providers`.

### Filters

Reuses the new Filters screen, with TV additions:

- Status: Still Running or Finished.
- Commitment level: Short and Sweet (1 to 2 seasons), A Few Seasons, Long Haul. Season count isn't a `discover/tv` filter, so it's applied after hydrating and needs deeper page walking.
- First-air date replaces release date.

### Cards and match screen

- Card line: `2019–2023 · 4 seasons · Ended`, then network and rating.
- The match screen shows seasons, status and network.

### Plex

- 395 shows are already in the Plex Request library, keyed by TVDB id (movies use TMDB ids), so Movie Date converts through `external_ids`.
- The library index gains TV. The Plex filter applies to shows too.
- Status adds a partial state: some seasons on Plex, others missing.
- Request on Plex gains a season picker, defaulting to all seasons. Plex Request already supports `seasons`.

## Fix first in Plex Request

Plex Request's search returns the **TVDB** id for shows and saves it in the `tmdbId` field, but approval then asks Sonarr for `tmdb:<that id>`. If Sonarr finds a different show under that number and the title doesn't match, the code falls back to the first result, which could add the wrong series. This comes from reading the code and hasn't been reproduced. Confirm it, and fix the lookup to use `tvdb:`, before Going Steady sends TV requests.

## Delivery

1. **In the current build:** media-aware keys and the `MediaType` schema groundwork.
2. **Backend:** TMDB TV client, `Show` type, deck, per-mode filters and rounds, actor path, Where to Watch.
3. **Frontend, in parallel with 2:** mode switch, routes, menu link, card, match and history variants, TV filters, copy.
4. **Plex:** confirm and fix the Sonarr lookup, then TV library index, statuses and season picker.
5. **Verify:** live two-user run covering both modes in one room, including a match in the other mode.

Choices made along the way are recorded in `docs/DECISIONS_FOR_REVIEW.md`.
