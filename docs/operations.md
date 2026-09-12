# Operation and free-tier budget

The deployment uses one Worker with static assets, one SQLite Durable Object, alarms, a five-minute recovery Cron and WebSocket Hibernation. No external inference API, database subscription or dataset credential is required at runtime.

## Progress and verification

`GET /api/health` returns the arena creation time, revision, current deadline, model version and completed-round count. A healthy response is `ok:true`, with revisions and round counts increasing. With no viewers, alarms continue advancing. A five-minute Cron repairs a missing alarm or overdue phase.

Inspect a recorded match at `/api/matches/<id>` and compare `predictionLockedAt < choicesLockedAt < revealedAt < completedAt`. Sum scores and verify one winner after five rounds. Round IDs identify outcomes across reconnects. A page opened at a different time should converge to the same current revision; a small network delivery delay is normal.

`npm test` covers graph integrity, checkpoint reproduction, separate learning states, private-choice isolation, deadline handling, real SQLite rollback on injected failure, duplicate settlement, two WebSocket viewers, cross-origin rejection, read-only messages and forced hibernation. Test-only routes and clock injection exist only in an in-memory test bundle and are never deployed.

## Storage retention

Detailed round rows are retained for approximately 14 days. Detailed match replays retain the latest 1,001 matches (about two days at the nominal schedule). Lifetime aggregate counters and current learned state persist. Older replay URLs return 404 after expiry. Export research records before they expire; this demonstration does not promise a permanent archive.

At nominal timing there are 480 matches and 2,400 rounds per day. Match JSON is approximately 14 KB. Bounded replay retention prevents indefinite storage growth. State writes occur per phase, not per animation frame or viewer heartbeat.

## Capacity

The room caps concurrent WebSocket viewers at 500. This is a protective ceiling, not a measured concurrency guarantee. Static files bypass Worker execution. Browser heartbeats use the platform auto-response feature; outgoing updates do not require a request from every viewer.

Cloudflare Free quotas, as checked 2026-09-12, include 100,000 Worker requests/day, 100,000 Durable Object requests/day, 13,000 GB-s/day, 5 million SQL rows read/day and 100,000 rows written/day. Index operations and reconnects count. A heavily shared launch can exceed the free allowance. Check the dashboard before increasing traffic; this project does not enable a paid plan.

Sources: https://developers.cloudflare.com/durable-objects/platform/pricing/ and https://developers.cloudflare.com/workers/platform/limits/.

## Updating safely

Frontend fixes may deploy without resetting the arena. A change to the graph, sensory mapping, learning parameters or random-number behavior requires a new `MODEL.version` and a new named Durable Object (currently `main-v1`) to keep one experiment internally consistent. Do not silently apply new parameters to old learned state.

Wrangler credentials are kept outside this repository, encrypted with a key in macOS Keychain. Do not publish browser cookies, neuPrint account tokens, `.wrangler`, `.env`, or raw private user context. Public data queries currently need no token.

## A 24-hour check

Record `/api/health` at launch and after at least 24 hours. Download recent matches and inspect timestamps for missing or duplicate rounds, scheduling gaps and count progression. A short successful smoke test is not a 24-hour stability result. The website's elapsed age does not by itself prove uninterrupted operation.
