# Decisions for review

Choices made while the owner was away. Each one can be changed; tell Claude which.

| # | Question | Chosen | Alternative | Why |
|---|---|---|---|---|
| 1 | Going Steady color scheme | Cool indigo to teal gradient with a teal accent | Plum to pink, or deep green | Clearest contrast with the warm coral and amber movie theme, and reads as "evening in" |
| 2 | Should the Sonarr lookup fix in Plex Request be deployed? | Open it as a separate PR and leave it undeployed. Request on Plex stays off for shows until it's live | Deploy it overnight | Approval to deploy covered one private function. This changes how live requests are approved for 11 users, so it should get the owner's review |
| 3 | Daily Plex request limit | 10 per user per day | No limit, or a different number | Stops a swipe app triggering a run of downloads |
