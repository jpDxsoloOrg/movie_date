# Movie Date

Movie Date helps couples and groups agree on what to watch. Everyone joins a room, swipes
through the same deck, and when enough of you like the same title, it's a match.

It's a mobile-first website that also installs as an app, live at
https://moviedate.jpdxsolo.com. It replaced the original Flutter and Supabase mobile
app.

## Features

- **Two modes:** Movies, and Going Steady for TV shows, each with its own theme, deck,
  filters, matches and round. Everyone shares one room, and members can be in different modes.
- **Rooms:** join with a code, an invite link or a QR code. Choose how many likes make a
  match, or require a majority.
- **Swiping:** drag, tap the buttons or use the keyboard, and undo a swipe.
- **Live matches:** everyone in the room hears about a match as it happens, including one
  in the other mode.
- **Filters:** genres, actors, streaming services and release dates, with a live count of
  what's in the deck. Shows add status and commitment level, which is how many seasons you're
  in for.
- **Title details:** trailers, facts, and where to watch.
- **History:** past matches and your swipes in each mode.
- **Plex:** link a Plex Request account to see what's in the library, filter to it, and
  request a missing movie. Requesting shows isn't available yet.
- **Accounts:** sign up with an email, set a display name and avatar, and reset a forgotten
  password. A first-run tutorial walks through 12 real screenshots of the app, matched to the
  mode and screen size. It can be skipped at any step and reopened from the menu.
- **Layouts:** separate navigation and layouts for phone, tablet and desktop.

## How it's built

An npm workspace in TypeScript:

| Package | Contents |
|---|---|
| `packages/core` | Types and rules shared by both sides |
| `packages/functions` | The AppSync Lambda resolver, Cognito triggers and the Plex index job |
| `packages/frontend` | The React 18 and Vite PWA |
| `packages/test` | vitest suites for all of the above |

`graphql/schema.graphql` is the API contract. Title data comes from TMDB and streaming
availability from RapidAPI.

## Running it

You need Node 22 and npm.

```bash
npm ci
npm test
npm run typecheck
npm run build
```

Run the tests from the repo root.

To work on the site locally, create `packages/frontend/.env.local` with the values from a
deployed stage. `sst deploy` prints them as `api`, `apiRealtime`, `userPoolId` and
`userPoolClientId`:

```
VITE_GRAPHQL_URL=
VITE_GRAPHQL_REALTIME_URL=
VITE_USER_POOL_ID=
VITE_USER_POOL_CLIENT_ID=
```

If you don't have the realtime value, delete that line rather than leaving it blank: the site
works it out when the line is missing, but a blank value breaks live updates. Then start Vite
with `npm run dev -w @movie-date/frontend`. There's no local backend.

### Testing against the live site

`scripts/e2e-live.mjs` drives real browsers through the production stack and deletes what
it creates. Playwright isn't a dependency of this repo, so point the script at an install:

```bash
AWS_PROFILE=<profile> PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node scripts/e2e-live.mjs
```

The comment at the top of the script explains its options and how to recover from a killed run.

## Hosting

Everything runs on AWS in `us-east-1` and is defined with SST in `sst.config.ts`:

- CloudFront and S3 serve the site
- AppSync serves the GraphQL API and realtime subscriptions, backed by one Lambda
- DynamoDB holds all app data in a single table
- S3 stores avatars
- Cognito handles accounts
- SES sends Plex link codes
- A scheduled Lambda refreshes the Plex library index every 6 hours

Deploying is a manual step:

```bash
AWS_PROFILE=<profile> npx sst deploy --stage production
```

CI (`.github/workflows/ci.yml`) typechecks, tests and builds every pull request.

## More

- [CLAUDE.md](CLAUDE.md): a working guide to the code
- [packages/frontend/README.md](packages/frontend/README.md): how screens are built
- [docs/](docs/): the specs and the design notes
