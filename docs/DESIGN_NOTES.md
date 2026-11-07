# Design notes

How the site looks and how it's put together. `packages/frontend/README.md` has the API
of each primitive. This covers the reasoning and who owns what.

## The idea

A warm movie night: the lights are down and the screen is the only bright thing. Pages
sit on a dark espresso brown rather than neutral grey, so posters and the coral to amber
gradient glow against them. The black chrome, the gradient behind the deck and match
screens, the orange accent and the full-bleed posters all carry over from the old app.

The headings are Fraunces, set soft and wonky so it reads like a 1970s film poster. Body
text stays on the system font: it's free to load, and it keeps the display face special.

## Tokens

| File | Holds |
|---|---|
| `styles/themes.css` | Everything that differs between modes, as `--theme-*` |
| `styles/tokens.css` | `--color-*` aliases, then type, space, shape, layout, motion. Entry point; imports the others |
| `styles/fonts.css` | `@font-face` for the display face and its metric-matched fallback |
| `styles/base.css` | Reset and element defaults |

Screens use `--color-*`. Only the aliases read `--theme-*`, and nothing outside
`themes.css` names a mode colour.

## Going Steady

Switching mode is one attribute: `document.documentElement.dataset.theme = "shows"`. The
`shows` block is already in `themes.css`, using the colours in the plan, and nothing in
the UI sets it yet. It has been checked in the browser on the login, Home and primitive
pages. `[data-theme]` works on a subtree too, which suits the other-mode match banner.

For the TV build:

- Add a `shows` link in the `navigation.ts` list and render it in `Drawer` and `SideNav`.
- `SegmentedControl` is the Movies | Shows switch and the History toggle.
- `themes.test.ts` fails if a theme misses a variable or a contrast pair.
- `--color-brand-red` is now the start of the mode's brand gradient. The name is left
  over from before; Celebration's confetti uses it, which is why it follows the mode.

## Rules that aren't obvious

- **Text never sits straight on the gradient.** No single colour passes on both ends of
  both themes. Use a scrim panel; `themes.test.ts` checks it against every stop.
- **The screen must not remount when the chrome changes.** `PageLayout` keeps each slot at
  a fixed position in the tree. Rotating a tablet would otherwise lose the deck.
- **Route transitions are enter only.** Keeping the old screen mounted for an exit would
  leave its effects and subscriptions running. The animation has no fill mode, because a
  leftover transform would become the containing block for `position: fixed` children.
- **Reduced motion.** `base.css` cuts every animation and transition to nothing, and
  `--route-distance` drops to 0. Anything driven from JS needs its own check.
- **Service logos need a light plate** (`.md-logo`, or use `Tile`). Several are dark on
  transparent and vanish on a dark surface.
- **CSP.** `style-src 'self'` blocks inline style markup in production, though not in dev.
  Setting `element.style` from JS, as the drag code does, is allowed.
- **Chips are 44px on touch and 36px with a mouse.** Everything else keeps
  `--touch-target` at every size.

## The display font

`styles/fonts/fraunces-display.woff2` is 31 KB, against 121 KB for the full variable file:
Latin glyphs only, `SOFT` 100, `WONK` 1 and `opsz` 60 pinned, weight kept as an axis from
600 to 900. Licence: `styles/fonts/OFL.txt`. It's self-hosted, so it needs no CSP change;
preloaded from `index.html`; hashed by Vite, so it's cached as immutable; precached by the
service worker; and `font-display: swap` over a metric-matched Georgia.

To rebuild it, use fonttools on `fraunces-latin-full-normal.woff2` from
`@fontsource-variable/fraunces`: `varLib.instancer` with `SOFT=100 WONK=1 opsz=60
wght=600:900`, then `pyftsubset` to Basic Latin, Latin-1 and common punctuation.

## Layout

| Width | Navigation | Column |
|---|---|---|
| Under 640px | App bar, drawer, bottom nav | Phone width, `--page-gutter` 16px |
| 640 to 1023px | 88px rail, with the drawer behind More | `--content-reading`, gutter 24px |
| From 1024px | 264px sidebar | `--content-reading`, gutter 32px |

The rail suits both tablets and phones in landscape, where an app bar and bottom nav
together would take a third of the height from the deck.

Screens stay in the centred column until they opt out by adding `md-page-wide` or
`md-page-full` to their root. That way a screen moves to a real desktop layout in its own
files, with no route change, and looks fine until then.

## File ownership

Each file has one owner, so builders in the same checkout don't collide. Ask the owner
rather than editing across a line.

| Owner | Files |
|---|---|
| Design system and shell | `src/styles/**`, `src/components/*` (top level only), `src/components/navigation.ts`, `src/AppRoutes.tsx`, `src/context/ToastProvider.*`, `src/hooks/useBreakpoint.ts`, `src/hooks/useLogOut.ts`, `src/screens/AuthLayout.tsx`, `src/screens/Auth.css`, `packages/frontend/README.md`, this file |
| Home and deck | `src/screens/Home.*`, `src/components/deck/**` |
| Filters | `src/screens/Filters.*`, `src/screens/ActorSearch.*`, `src/components/filters/**` |
| Match and History | `src/screens/MatchFound.*`, `src/screens/History.*`, `src/components/match/**` |
| Room and account | `src/screens/Members.*`, `src/screens/Profile.*`, `src/screens/Settings.*`, `src/screens/JoinInvite.*`, `src/components/room/**` |
| Tutorial | `src/screens/Tutorial.*` |
| Auth forms | `src/screens/Login.tsx`, `src/screens/Register.tsx`, `src/screens/ForgotPassword.tsx`: logic only, the look is `Auth.css` |
| API and generated code | `src/services/**`, `src/gql/**`, `src/context/RoomProvider.tsx` |

Tests mirror the source file's owner. Plex UI lands in the file of the screen it appears on.
