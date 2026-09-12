# Operation and free-tier budget

Current deployment: five-player Dou Dizhu, `ddz-five-v1`. One Worker serves static assets and a single SQLite Durable Object. Alarms keep the game advancing without viewers; a five-minute Cron is the recovery watchdog. No external inference service or dataset credential is required.

## Progress and integrity

`/api/health` reports the namespace, model, creation time, current season/round/hand, deadline, confirmed plays and completed hands. One authoritative state commit precedes broadcast. Reconnecting viewers converge to the same revision; brief differences caused by network latency are normal.

`/api/matches/:id` returns the recorded legal plays, teams and zero-sum transfers of a retained hand. `/api/seasons/:id` preserves round scores, closing balances, debts and the champion. The named old Sugar Heist object is explicitly retired on upgrade: its alarm is removed, its stored data is retained, and it does not continue an obsolete game in the background.

Tests use real Miniflare/workerd SQLite storage for transaction rollback, duplicate alarms, five-player persistence, two-viewer agreement, read-only sockets, source isolation and complete season transitions. Test injection routes exist only in a generated test bundle and are not deployed.

## Bounded storage and diagnostics

Only the current state is written on an ordinary move. Its next alarm is written in the same transaction. Plays are already inside that persistent checkpoint; they are not duplicated into a per-play SQL table. A completed hand is archived separately. The latest 1,001 completed hands and 100 completed seasons are retained. Round summaries are bounded to three per season. Earlier detailed records expire; lifetime aggregates and current learning state persist.

Five `lastNeural` records preserve only each player's most recent 160 ms neural decision. They contain actual spikes and model state, not continuously generated activity during the 3-second viewing interval. Full HTTP and initial WebSocket snapshots provide all five; subsequent broadcasts use `neuralMode:delta` with only changed player records. The frontend merges these until the arena creation identity changes. Full `snapshot` messages resynchronize a client.

Neural diagnostics do not enter every archived play. SQLite-backed Durable Object values permit up to 2 MB for a key/value pair; tests measure actual checkpoint size with the five diagnostics included. See [platform limits](https://developers.cloudflare.com/durable-objects/platform/limits/).

## Free-tier budget

Cloudflare Free quotas checked on 2026-09-12 include 100,000 Worker requests/day, 100,000 Durable Object requests/day, 13,000 GB-s/day, 5 million SQLite rows read/day and 100,000 rows written/day. Free-tier allowances are finite and shared with other workloads on the account. No paid plan has been enabled for this project.

A 3-second minimum transition interval has an upper bound of 28,800 ordinary transitions/day. One checkpoint-key write plus one alarm write is approximately 57,600 row writes/day, before hand/season archive writes and expiry deletion. Actual scheduling includes longer dealing, bombs, settlement, credit and season phases. Avoid introducing a second per-move database log or periodic writes for every viewer.

The room has a 500-WebSocket protective cap; this is not a measured load guarantee. Static assets bypass Worker execution. Platform WebSocket auto-responses handle heartbeats without waking application code. Broadcast data, CPU, reconnects, read queries and other account projects still matter. Widespread sharing may exceed the free allowance; consult the dashboard before claiming unlimited capacity.

Sources: [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [Workers limits](https://developers.cloudflare.com/workers/platform/limits/), [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/).

## Deployment changes

Frontend-only fixes can deploy while the table continues. Changes to graph, encoding, actual decision parameters, randomness or financial rules require a new model version and arena namespace. Observation-only diagnostics were checked to leave decisions, random state and learned gains unchanged.

Wrangler and GitHub credentials stay outside the repository. Never publish cookies, `.wrangler`, `.env`, neuPrint account tokens or private account context. Public extraction requires no login token.

## Long-duration checks

Use `scripts/audit-doudizhu.js` for this game. The old `audit-live.js` remains explicitly a historical Sugar Heist checker. Start from a fresh actual production baseline after the new game is deployed. A short smoke test, a collection of successful offline simulations or the age of an arena does not establish 24-hour availability. Only report checks that actually completed.
