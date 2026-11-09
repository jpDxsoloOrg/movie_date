# @movie-date/frontend

React 18 + Vite + react-router 6 PWA. This is the briefing for screen builders.
`docs/REWRITE_SPEC.md` and `graphql/schema.graphql` are
the contract. `docs/DESIGN_NOTES.md` has the look, the primitives and who owns which file;
read it before building a screen.

## Commands

From this package: `npm run dev`, `npm run build`, `npm run typecheck`, `npm run codegen`.
Tests live in `packages/test/frontend/src`, mirroring `src`: `cd packages/test && npx vitest run frontend/`.

The build and dev server need these (set by `sst.config.ts`; locally, `.env.local`):
`VITE_GRAPHQL_URL`, `VITE_GRAPHQL_REALTIME_URL` (optional, derived from the first),
`VITE_USER_POOL_ID`, `VITE_USER_POOL_CLIENT_ID`.

## Rules

- No `any`. Functional components. async/await. Comments explain why, not what.
- One plain CSS file per component, imported by it (`Home.tsx` + `Home.css`). Use the
  tokens in `src/styles/tokens.css` rather than raw colours or sizes. Mode colours come
  only from `--theme-*` (`src/styles/themes.css`), through the `--color-*` aliases.
- No inline styles, except values computed per frame (drag transforms). The site's CSP
  has `style-src 'self'`, so inline `<style>` and `style=""` markup won't run in production.
- Breakpoints are tablet from 640px and desktop from 1024px. Use a media query when only
  the look changes, and `useBreakpoint()` when the DOM must differ.
- Touch targets are at least `var(--touch-target)`. Every control has a label.
- Primitive classes start `md-`. Prefix your own with the screen name to avoid clashes.
- Don't add GraphQL operations in screens. If one is missing, it belongs in `services/api.ts`.

## How a screen fits in

`src/AppRoutes.tsx` wraps every screen in `PageLayout`, so **a screen renders only its
content**: no app bar, drawer, nav, page title or gradient. Default-export the component
from its file under `src/screens`.

`PageLayout` draws the chrome for the viewport, and the screen stays mounted when that changes:

| Viewport | Navigation | Page title |
|---|---|---|
| Under 640px | App bar, drawer, bottom nav where the route asks for it | In the app bar |
| 640 to 1023px | Rail, with the drawer behind More | `PageHeader` above the screen |
| From 1024px | Sidebar | `PageHeader` above the screen |

| Route | Screen | Layout |
|---|---|---|
| `/` | `Home` | gradient, bottom nav, `fill` |
| `/filters` | `Filters` | bottom nav |
| `/filters/actors` | `ActorSearch` | `bare`: no chrome at any width |
| `/match/:matchId` | `MatchFound` | gradient |
| `/history`, `/members`, `/profile`, `/settings` | same names | titled for the page |
| `/join/:code` | `JoinInvite` | plain |
| `/tutorial` | `Tutorial` | **none**: wrap in `<PageLayout gradient>` yourself if wanted |

Layout facts:

- Your root element is a flex child of the column and stretches to fill it. The content
  area scrolls for you. Give your root `var(--space-4)` side padding; the column adds
  whatever else the viewport's gutter needs, so don't widen it yourself.
- The column is phone-width on gradient pages and `--content-reading` elsewhere. For a real
  desktop layout, add a class to your root: `md-page-wide` (up to `--content-wide`) or
  `md-page-full` (edge to edge, no gutter). Your CSS then decides the grid.
- `Home` is under `fill`: nothing scrolls and `height: 100%` works, so the deck can size
  to the space. It still needs `touch-action: none` on the card.
- On other screens percentage heights don't resolve; use flex.
- Text never sits directly on the gradient. Put it on `--color-scrim` (`<Card variant="scrim">`,
  or the `onGradient` prop on state messages) with `--color-on-gradient` text.
- Buttons for the page header: wrap them in `<PageActions>` anywhere in the screen. To add a
  subtitle, or on a route with no title, render `<PageHeader>` at the top of the screen.
- Safe-area insets are handled by the layout. Anything you fix to a screen edge must add
  `var(--safe-bottom)` etc itself.

`src/components/JoinRoomDialog.tsx` is opened by `BottomNav`. Keep its default export and
its `{ open, onClose }` props. Build it on `Modal`. `SideNav` opens it too.

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
- `useFocusTrap(open, onClose)` is for building a new overlay; prefer `Modal` and `Sheet`.
- `useBreakpoint()` returns `"mobile" | "tablet" | "desktop"`, live and right on first render.
- `useLogOut()` returns the async log out used by the drawer and sidebar.

`services/tutorial.ts` has `hasSeenTutorial()` and `markTutorialSeen()`. The Tutorial screen
finishes with `markTutorialSeen()` then `navigate(useReturnPath(), { replace: true })`, or an
invite link visitor would lose their place. Reopened from the drawer, the return path is `/`.

The tutorial is 12 steps of real screenshots, listed in `screens/tutorial/steps.ts`. Each
step has an image per mode and size (`tutorial-<movies|shows>-<step>-<phone|desktop>.webp`).
Tablets use the phone shot, and the mode step shows the other mode's deck. Skip works on
every step. After a UI change that a step shows, retake them against the live site:

```bash
AWS_PROFILE=<profile> PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node scripts/capture-tutorial.mjs
```

It writes `src/screens/tutorial/*.webp` and removes its throwaway accounts with
`e2e-live.mjs --cleanup`. A shot must never show anyone's likes but the viewer's own.

## Primitives (`src/components`)

```tsx
<Button variant="primary|brand|secondary|ghost" block loading onClick={...}>Save</Button>
<IconButton label="Undo"><Icon name="undo" /></IconButton>
<Icon name="heart" />                    // names in Icon.tsx; add to ICON_PATHS if one's missing
<TextField label="Name" value={...} onChange={...} error={...} hint="..." />
<Modal open onClose={...} title="Leave room?" actions={<Button>...</Button>}>body</Modal>
<Sheet open onClose={...} title="Services" actions={<Button>Apply</Button>} size="sm|md|lg" fullScreen>body</Sheet>
<Sheet open onClose={...} label="Movie details">body</Sheet>   // no visible title
<PageHeader title="..." eyebrow="..." subtitle="..." actions={...} />
<PageActions><Button>Invite</Button></PageActions>
<Card variant="surface|raised|scrim" as="section" title="..." subtitle="..." action={...} flush>body</Card>
<Chip label="Comedy" selected onClick={...} />                 // toggle
<Chip label="Tom Hanks" leading={<img ... />} onRemove={...} /> // removable
<div className="md-tile-grid"><Tile label="Netflix" imageUrl="/icons/netflix.png" selected onClick={...} /></div>
<SegmentedControl label="View" options={[{ value, label, icon }]} value={...} onChange={...} block onGradient />
<Skeleton shape="text|title|circle|rect|card|poster|chip|tile" className="my-size" />
<SkeletonList rows={5} />  <SkeletonPosterGrid count={6} />  <SkeletonChoices count={8} shape="chip|tile" />
<EmptyState title="..." message="..." icon="heart" action={<Button>...</Button>} onGradient />
<ErrorState message="..." onRetry={reload} onGradient />
<kbd className="md-kbd">←</kbd>  <img className="md-logo" ... />  // logo on a light plate
```

`primary` is the orange accent; `brand` is the mode's gradient, used on the login screens. Modal,
Sheet and Drawer portal to `body`, trap focus, close on Escape and the backdrop, and return focus
to the opener. Only render the trailer iframe while the sheet is open.

`Sheet` is a draggable bottom sheet on phones and a centred dialog from 640px, as one element,
so crossing over doesn't reload what's inside. `BottomSheet` is the same component under its old
name, and `Modal` stays a small centred dialog for confirmations at every width.

Headings (`h1` to `h3`) use the display face by default. Anything else that should can use
`font-family: var(--font-display)`.

jsdom has no `matchMedia`, so tests see the mobile layout unless they call `fakeViewport(width)`
from `packages/test/frontend/src/support/viewport.ts`.

Testing a screen: mock `services/api`, and render under `MemoryRouter`, `ToastProvider` and either
`RoomProvider` (with `services/realtime` mocked) or `RoomContext.Provider` with a fake value.
`packages/test/frontend/src/context/RoomProvider.test.tsx` shows the setup.

## PWA

`vite-plugin-pwa` precaches the app shell. The API is never cached. A new service worker takes
over quietly and the update shows on the next load; the page is never reloaded under someone.

## Regenerating types

Operations live in `services/api.ts`. After changing one or the schema, run `npm run codegen`.
`src/gql` is generated and committed; don't edit it.
