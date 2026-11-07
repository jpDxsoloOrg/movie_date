# @movie-date/frontend

React 18 + Vite + react-router 6 PWA. This is the briefing for screen builders.
`docs/REWRITE_SPEC.md` and `graphql/schema.graphql` are the contract; `lib/` is the
reference for look and behaviour.

## Commands

From this package: `npm run dev`, `npm run build`, `npm run typecheck`, `npm run codegen`.
Tests live in `packages/test/frontend/src`, mirroring `src`: `cd packages/test && npx vitest run frontend/`.

The build and dev server need these (set by `sst.config.ts`; locally, `.env.local`):
`VITE_GRAPHQL_URL`, `VITE_GRAPHQL_REALTIME_URL` (optional, derived from the first),
`VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`.

## Rules

- No `any`. Functional components. async/await. Comments explain why, not what.
- One plain CSS file per component, imported by it (`Home.tsx` + `Home.css`). Use the
  tokens in `src/styles/tokens.css` rather than raw colours or sizes.
- No inline styles, except values computed per frame (drag transforms).
- Touch targets are at least `var(--touch-target)`. Every control has a label.
- Primitive classes start `md-`. Prefix your own with the screen name to avoid clashes.
- Don't add GraphQL operations in screens. If one is missing, it belongs in `services/api.ts`.

## How a screen fits in

`src/AppRoutes.tsx` wraps every screen in `PageLayout`, so **a screen renders only its
content**: no app bar, drawer, nav or gradient. Default-export the component from its
file under `src/screens`.

| Route | Screen | Layout |
|---|---|---|
| `/` | `Home` | gradient, bottom nav, `fill` |
| `/filters`, `/filters/actors` | `Filters`, `ActorSearch` | bottom nav |
| `/match/:matchId` | `MatchFound` | gradient |
| `/history`, `/members`, `/profile`, `/settings` | same names | app bar titled for the page |
| `/join/:code` | `JoinInvite` | plain |
| `/tutorial` | `Tutorial` | **none**: wrap in `<PageLayout gradient>` yourself if wanted |

Layout facts:

- Your root element is a flex child of the phone-width column and stretches to fill it.
  The content area scrolls for you. Give your root padding (`var(--space-4)` is usual).
- `Home` is under `fill`: nothing scrolls and `height: 100%` works, so the deck can size
  to the space. It still needs `touch-action: none` on the card.
- On other screens percentage heights don't resolve; use flex.
- Over the gradient, use `--color-on-gradient` text and the `onGradient` prop on state messages.
- Safe-area insets are handled by the layout. Anything you fix to a screen edge must add
  `var(--safe-bottom)` etc itself.

`src/components/JoinRoomDialog.tsx` is opened by `BottomNav`. Keep its default export and
its `{ open, onClose }` props. Build it on `Modal`.

## Room state: `useRoom()`

Every signed-in screen sits under `RoomProvider`, which shows a skeleton or a retry until
loaded. So `me` and `room` are **never null** in a screen.

```ts
import { useRoom, useRoomEvents } from "../hooks/useRoom";

const {
  me,             // Profile
  room,           // Room, with members
  realtimeStatus, // "connecting" | "live" | "offline"
  deckVersion,    // number: changes when the deck is out of date
  setRoom,        // apply a Room returned by a mutation
  setMe,          // apply the Profile from updateProfile
  refreshRoom,    // refetch myRoom
  goToMatch,      // route to the match screen with a Match in hand
} = useRoom();
```

The provider already does the following, so **don't repeat it in a screen**:

- routes everyone to `/match/:matchId` on `MATCH_FOUND`, and on load, reconnect and tab focus via `pendingMatch`;
- refetches the room on `ROOM_UPDATED`, `ROUND_RESET` and `MEMBERS_CHANGED`, so `room` is live;
- shows the "X joined the room" / "X left the room" toasts;
- moves the subscription when `room.id` changes.

What a screen must do:

- **After every mutation that returns a Room** (`updateFilters`, `updateRoomSettings`,
  `joinRoom`, `leaveRoom`, `startNewRound`), call `setRoom(result)`. Skipping it leaves the
  subscription on the old room after a join.
- **Home:** load the deck in an effect that depends on `deckVersion`. It changes only when
  the room id, round or filters change, so a threshold change or an event echo won't reset
  someone mid-swipe.
- **Home:** when `api.swipe` returns `match`, call `goToMatch(result.match)`. Don't wait for
  the subscription. The later event is ignored because each match routes a person only once.
- **MatchFound:** read the match from router state and fall back to the API on a reload:

  ```ts
  import type { MatchRouteState } from "../context/RoomProvider";
  const { matchId } = useParams();
  const state = useLocation().state as MatchRouteState | null;
  const { data: match } = useAsyncData(
    async () => state?.match ?? (matchId ? api.findMatch(matchId) : null),
    [matchId],
  );
  ```

  On a `MATCH_FOUND` event the state has no `match`, so `findMatch` runs. It returns null if
  the match isn't in this room. Back to Start is
  `setRoom(await api.startNewRound(match.round))` then `navigate("/")`. Pass the match's
  round, not `room.round`: `room` is live, so if someone else already pressed it, `room.round`
  would start yet another round. A stale `expectedRound` is a no-op.

`useRoomEvents((event) => ...)` listens to raw events, for anything beyond the above. `actorId`
tells you whether the event is your own echo (`event.actorId === me.id`).

## API: `services/api.ts`

`api.<operation>()` covers every query and mutation. Each returns the field's value.

```ts
import { api, errorMessage, ApiError, type Movie, type DeckCard } from "../services/api";

api.me(); api.myRoom(); api.deck(page); api.movie(id); api.trailer(movieId);
api.watchOptions(movieId); api.genres(); api.searchPeople(query);
api.matches({ limit, nextToken }); api.swipeHistory({ limit, nextToken }); api.pendingMatch();
api.swipe(movieId, "LIKE"); api.undoSwipe(movieId); api.updateFilters(filters);
api.updateRoomSettings(matchThreshold, requireMajority); api.joinRoom(code); api.leaveRoom();
api.startNewRound(expectedRound); api.updateProfile({ displayName, avatarKey });
api.createAvatarUpload(contentType);
```

Extras the schema doesn't give directly:

- `api.uploadAvatar(blob, contentType)` gets the presigned POST, uploads, and returns the key
  for `updateProfile`. Crop and resize to a 512px JPEG before calling it.
- `api.findMatch(matchId)` looks a match up by id. The schema has no such query.

Types are exported from the same file: `Profile`, `Room`, `Member`, `Movie`, `Person`, `Match`,
`HistoryEntry`, `Genre`, `WatchOption`, `DeckPage`, `DeckCard`, `RoomEvent`, `FiltersInput`,
`SwipeDirection`. `room.filters` can be passed to `updateFilters` as it is.

Failures throw `ApiError`, with `code` (`NOT_FOUND`, `FORBIDDEN`, `VALIDATION`, `CONFLICT`,
`UNAUTHORIZED`, `UPSTREAM`, `NETWORK`, `UNKNOWN`) and `isTransient`. The backend's messages
are safe to show, so `toast.error(errorMessage(error))` is the normal handling. That is how
`Invalid room code` reaches the person. An expired session is refreshed, and a dead one
signs out and lands on login, without any screen code.

The provider catalogue and other shared logic are in `@movie-date/core` (`PROVIDERS` etc).

## Hooks

- `useAsyncData(load, deps)` returns `{ data, error, loading, reload, setData }`. Drops stale
  results and keeps old data during a reload. `loading && !data` means show a skeleton;
  `error && !data` means show `ErrorState` with `reload`.
- `useToast()` returns `{ info, success, error }`, each taking a message.
- `useAuth()` returns `{ status }`. Screens seldom need it.
- `useReturnPath()` gives the path a guard diverted from, or `/`.
- `useFocusTrap(open, onClose)` is for building a new overlay; prefer `Modal` and `BottomSheet`.

`services/tutorial.ts` has `hasSeenTutorial()` and `markTutorialSeen()`. The Tutorial screen
finishes with `markTutorialSeen()` then `navigate(useReturnPath(), { replace: true })`, or an
invite link visitor would lose their place. Reopened from the drawer, the return path is `/`.

## Primitives (`src/components`)

```tsx
<Button variant="primary|brand|secondary|ghost" block loading onClick={...}>Save</Button>
<IconButton label="Undo"><Icon name="undo" /></IconButton>
<Icon name="heart" />                    // names in Icon.tsx; add to ICON_PATHS if one's missing
<TextField label="Name" value={...} onChange={...} error={...} hint="..." />
<Modal open onClose={...} title="Leave room?" actions={<Button>...</Button>}>body</Modal>
<BottomSheet open onClose={...} label="Movie details">body</BottomSheet>
<Skeleton shape="text|title|circle|rect|card" className="my-size" />
<SkeletonList rows={5} />
<EmptyState title="..." message="..." action={<Button>...</Button>} onGradient />
<ErrorState message="..." onRetry={reload} onGradient />
```

`primary` is the orange accent; `brand` is the red used on the login screens. Modal, BottomSheet
and Drawer portal to `body`, trap focus, close on Escape and the backdrop, and return focus to
the opener. Only render the trailer iframe while the sheet is open.

Testing a screen: mock `services/api`, and render under `MemoryRouter`, `ToastProvider` and either
`RoomProvider` (with `services/realtime` mocked) or `RoomContext.Provider` with a fake value.
`packages/test/frontend/src/context/RoomProvider.test.tsx` shows the setup.

## PWA

`vite-plugin-pwa` precaches the app shell. The API is never cached. A new service worker takes
over quietly and the update shows on the next load; the page is never reloaded under someone.

## Regenerating types

Operations live in `services/api.ts`. After changing one or the schema, run `npm run codegen`.
`src/gql` is generated and committed; don't edit it.
