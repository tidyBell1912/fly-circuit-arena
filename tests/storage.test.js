import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';
import { evaluateAudit } from '../scripts/audit-doudizhu.js';

const project = new URL('../', import.meta.url).pathname.slice(0, -1);
let source = await fs.readFile(project + '/worker/index.js', 'utf8');
source = source.replaceAll('Date.now()', '__clockNow()');
source = `let __clock = ${Date.now() + 365 * 86400000}, __peakCheckpointBytes = 0; const __clockNow = () => __clock;\n` + source;
source = "import { createArena as createLegacyArena } from '../src/arena.js';\n" + source;
source = source.replace('const url = new URL(request.url);', `const url = new URL(request.url);
    if (url.pathname === '/api/__test/tick') {
      if (!url.searchParams.has('same')) __clock = this.state.deadline + (Number(url.searchParams.get('late')) || 0);
      this.__failTransaction = url.searchParams.has('fail');
      await this.step();
      return json(publicState(this.state));
    }
    if (url.pathname === '/api/__test/before-event') {
      const kind = url.searchParams.get('kind');
      for (let i = 0; i < 15000; i++) {
        const preview = structuredClone(this.state);
        const event = advanceArena(preview, preview.deadline);
        if (event[kind]) return json(publicState(this.state));
        __clock = this.state.deadline;
        await this.step();
      }
      throw new Error('Test event guard exceeded');
    }
    if (url.pathname === '/api/__test/inspect') {
      return json({ state: this.state, stored: await this.ctx.storage.get('state'),
        matches: this.ctx.storage.sql.exec('SELECT body FROM matches ORDER BY id').toArray(),
        seasons: this.ctx.storage.sql.exec('SELECT body FROM seasons ORDER BY id').toArray(),
        tables: this.ctx.storage.sql.exec("SELECT name FROM sqlite_master WHERE type='table'").toArray(),
        alarm: await this.ctx.storage.getAlarm(), peakCheckpointBytes: __peakCheckpointBytes });
    }`);
source = source.replace("await tx.put('state', next);", "if (this.__failTransaction) throw new Error('Injected transaction failure');\n        await tx.put('state', next);");
source = source.replace('this.state = next;', 'this.state = next; __peakCheckpointBytes = Math.max(__peakCheckpointBytes, new TextEncoder().encode(JSON.stringify(next)).length);');
source = source.replace('async alarm()', `async testSeedLegacy() {
    this.state = createLegacyArena(__clock, 77);
    await this.ctx.storage.put('state', this.state);
    this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS rounds (id TEXT PRIMARY KEY, body TEXT NOT NULL)');
    this.ctx.storage.sql.exec('INSERT INTO rounds (id, body) VALUES (?, ?)', 'legacy-1', 'retained legacy round');
    await this.ctx.storage.setAlarm(__clock + 30000);
    return JSON.stringify(this.state);
  }
  async testInspectLegacy() {
    return JSON.stringify({ retired: this.retired, state: this.state, stored: await this.ctx.storage.get('state'),
      alarm: await this.ctx.storage.getAlarm(), rounds: this.ctx.storage.sql.exec('SELECT * FROM rounds').toArray() });
  }
  async testInvokeAlarm() { await this.alarm(); return this.testInspectLegacy(); }
  async alarm()`);
// HTTP-only test hooks avoid retaining an RPC reference while deliberately
// evicting the legacy object. None of these routes exists in the shipped worker.
source = source.replace('async fetch(request) {', `async fetch(request) {
    const testPath = new URL(request.url).pathname;
    if (testPath === '/__legacy/seed') return new Response(await this.testSeedLegacy());
    if (testPath === '/__legacy/inspect') return new Response(await this.testInspectLegacy());
    if (testPath === '/__legacy/alarm') return new Response(await this.testInvokeAlarm());`);
source = source.replace('async fetch(request, env) {', `async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith('/__legacy/')) return env.ARENA.getByName('main-v1').fetch(request);`);
const bundled = await build({ stdin: { contents: source, resolveDir: project + '/worker', sourcefile: 'review-worker.js' }, bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:workers'] });
const mf = new Miniflare(convertV4MiniflareOptions({ name: 'review', modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-09-12', durableObjects: { ARENA: { className: 'FlyArena', useSQLite: true } }, log: new Log(LogLevel.NONE) }));
const read = async path => { const r = await mf.dispatchFetch('https://arena.test' + path); assert.equal(r.status, 200, path); return r.json(); };
const tick = query => read('/api/__test/tick' + (query || ''));
const inspect = () => read('/api/__test/inspect');
const noSecrets = pub => {
  const str = JSON.stringify(pub);
  assert.equal(/"(?:rng|dealRng|gains|features|credits|recentCredits|privatePartner)":/.test(str), false, 'Private policy state leaked');
  assert.equal(str.includes('support-known-ally'), false, 'Candidate label disclosed hidden ally');
};
try {
  let pub = await read('/api/state');
  assert.equal(pub.phase, 'deal');
  assert.equal(pub.model.namespace, 'ddz-five-v1');
  assert.equal(pub.players.length, 5);
  assert.deepEqual(pub.balances, [10000, 10000, 10000, 10000, 10000]);
  assert.deepEqual(pub.hands.map(h => h.length), [20, 20, 20, 20, 20]);
  assert.equal(pub.season.id, 1);
  assert.equal(pub.stats.matches, 0);
  assert.equal(pub.stats.seasons, 0);
  const initial = await inspect();
  const auditBaseline = { ...await read('/api/health'), checkedAt: new Date(initial.state.createdAt).toISOString() };
  assert.deepEqual(initial.state, initial.stored);
  assert.equal(initial.state.schema, 2);
  assert.equal(initial.tables.some(t => t.name === 'rounds'), false, 'Per-play duplicate SQL table should not exist');
  noSecrets(pub);
  for (let guard = 0; guard < 100 && pub.phase !== 'play'; guard++) pub = await tick();
  assert.equal(pub.phase, 'play');
  assert.equal(pub.partner, null);
  assert.equal(pub.match.partner, null);
  assert.equal(pub.identityCard, null);
  assert.equal(pub.roles.filter(r => r === 'landlord').length, 1);
  assert.equal(pub.roles.filter(r => r === 'unrevealed').length, 4);
  for (const path of ['/api/state', '/api/matches/current', '/api/matches/1']) {
    const result = await read(path); noSecrets(result);
    assert.equal(result.match.partner, null);
    assert.equal(result.match.identityCard, null);
  }
  const beforeDuplicate = await inspect();
  await tick('?same');
  assert.deepEqual((await inspect()).stored, beforeDuplicate.stored);
  pub = await tick();
  assert.equal(pub.match.plays.length, 1);
  assert.equal(pub.stats.rounds, 1);
  assert.equal((await inspect()).matches.length, 0);
  const rounds = await read('/api/rounds?limit=20');
  assert.equal(rounds.kind, 'card-plays'); assert.equal(rounds.rounds.length, 1);
  assert.equal(rounds.rounds[0].id, '1-1'); noSecrets(rounds);

  // Fail after the actual match SQL insertion, before checkpoint and alarm commit.
  await read('/api/__test/before-event?kind=match');
  const beforeFailure = await inspect();
  const failed = await mf.dispatchFetch('https://arena.test/api/__test/tick?fail');
  assert.equal(failed.status, 500);
  const afterFailure = await inspect();
  assert.deepEqual(afterFailure.stored, beforeFailure.stored, 'Failed settlement changed durable state');
  assert.equal(afterFailure.matches.length, 0, 'Match INSERT survived rollback');
  pub = await tick();
  assert.equal(pub.phase, 'settle'); assert.equal(pub.stats.matches, 1);
  const settled = await inspect();
  assert.deepEqual(settled.state, settled.stored);
  assert.equal(settled.matches.length, 1);
  assert.equal(settled.state.hands[settled.state.match.winner].length, 0);
  assert.equal(settled.state.match.pointsDelta.reduce((a, b) => a + b, 0), 0);
  assert.ok(settled.state.brains.some(b => b.updates > 0));
  assert.equal(settled.state.match.plays.filter(p => p.trace).length <= 2, true);
  assert.ok(Buffer.byteLength(JSON.stringify(settled.state)) < 1500000, 'Checkpoint approaches SQLite value limit');
  const archived = JSON.parse(settled.matches[0].body);
  assert.equal(archived.plays.length, settled.state.match.plays.length);
  assert.ok(archived.plays.every(p => !p.trace && !p.candidates));
  assert.equal(archived.model, pub.model.version);
  const allPlayed = [...settled.state.hands.flat(), ...archived.plays.flatMap(p => p.cards)];
  assert.equal(allPlayed.length, 108); assert.equal(new Set(allPlayed).size, 108);
  noSecrets(archived);
  await tick('?same');
  assert.deepEqual((await inspect()).stored, settled.stored, 'Duplicate settlement repeated balances or learning');
  assert.equal((await inspect()).matches.length, 1);

  const sockets = [], messages = [];
  for (let i = 0; i < 2; i++) {
    const r = await mf.dispatchFetch('https://arena.test/api/live', { headers: { Upgrade: 'websocket', Origin: 'https://arena.test' } });
    assert.equal(r.status, 101);
    const ws = r.webSocket; messages[i] = [];
    ws.addEventListener('message', e => messages[i].push(e.data)); ws.accept(); sockets.push(ws);
  }
  const waitFor = async predicate => { for (let i = 0; i < 100; i++) { if (predicate()) return; await new Promise(r => setTimeout(r, 10)); } throw new Error('Timed out waiting for WS'); };
  await waitFor(() => messages.every(m => m.length));
  const stable = data => { const { serverTime, ...rest } = data; return rest; };
  assert.deepEqual(stable(JSON.parse(messages[0][0]).data), stable(JSON.parse(messages[1][0]).data));
  assert.equal(JSON.parse(messages[0][0]).data.neuralMode, 'full');
  noSecrets(JSON.parse(messages[0][0]));
  // Reconstruct the client cache from incremental updates, including phases
  // with no new neural decision, then compare against an independent full GET.
  const cachedNeural = JSON.parse(messages[0][0]).data.lastNeural;
  assert.equal(cachedNeural.filter(Boolean).length, 5);
  let sawEpisode = false, sawEmpty = false, largestDeltaBytes = 0;
  for (let i = 0; i < 30 && (!sawEpisode || !sawEmpty); i++) {
    const length = messages[0].length;
    await tick(); await waitFor(() => messages.every(m => m.length > length));
    const wire = messages[0].at(-1), delta = JSON.parse(wire).data;
    largestDeltaBytes = Math.max(largestDeltaBytes, Buffer.byteLength(wire));
    assert.equal(delta.neuralMode, 'delta');
    assert.equal(delta.lastNeural.length, 5);
    const changed = delta.lastNeural.filter(Boolean);
    assert.ok(changed.length <= 1, 'Unchanged neural episodes were rebroadcast');
    sawEpisode ||= changed.length === 1; sawEmpty ||= changed.length === 0;
    delta.lastNeural.forEach((episode, seat) => { if (episode) cachedNeural[seat] = episode; });
    const full = await read('/api/state');
    assert.equal(full.neuralMode, 'full');
    assert.deepEqual(cachedNeural, full.lastNeural, 'Delta merge differs from canonical checkpoint');
    assert.deepEqual(stable(delta), stable(JSON.parse(messages[1].at(-1)).data));
    noSecrets(delta);
  }
  assert.ok(sawEpisode && sawEmpty);
  const cross = await mf.dispatchFetch('https://arena.test/api/live', { headers: { Upgrade: 'websocket', Origin: 'https://evil.test' } });
  assert.equal(cross.status, 403);
  const beforeEvict = await inspect();
  await mf.unsafeEvictDurableObject('review', 'FlyArena', { name: 'ddz-five-v1', webSockets: 'hibernate' });
  sockets[0].send('ping'); await waitFor(() => messages[0].includes('pong'));
  const beforeSnapshot = messages[0].length;
  sockets[0].send('snapshot'); await waitFor(() => messages[0].length > beforeSnapshot);
  assert.equal(JSON.parse(messages[0].at(-1)).data.neuralMode, 'full');
  const afterEvict = await inspect();
  assert.deepEqual(afterEvict.state, beforeEvict.state);
  assert.deepEqual(afterEvict.stored, beforeEvict.stored);
  let closeCode; sockets[1].addEventListener('close', e => closeCode = e.code);
  sockets[1].send('{"cards":[0]}'); await waitFor(() => closeCode !== undefined);
  assert.equal(closeCode, 1008); sockets[0].close(1000, 'Test complete');

  // Natural game progression creates three summaries, then an atomic season archive.
  await read('/api/__test/before-event?kind=roundSummary');
  const roundBefore = await inspect(); await tick();
  let summaryState = await inspect();
  assert.equal(summaryState.state.season.rounds.length, roundBefore.state.season.rounds.length + 1);
  const summaryCheckpoint = structuredClone(summaryState.stored); await tick('?same');
  assert.deepEqual((await inspect()).stored, summaryCheckpoint);
  await read('/api/__test/before-event?kind=season');
  const seasonBefore = await inspect();
  assert.equal(seasonBefore.state.season.rounds.length, 3);
  const failedSeason = await mf.dispatchFetch('https://arena.test/api/__test/tick?fail');
  assert.equal(failedSeason.status, 500);
  assert.deepEqual((await inspect()).stored, seasonBefore.stored);
  assert.equal((await inspect()).seasons.length, 0);
  pub = await tick();
  assert.equal(pub.phase, 'seasonEnd'); assert.equal(pub.stats.seasons, 1);
  assert.equal((await read('/api/seasons')).seasons.length, 1);
  assert.equal((await read('/api/seasons/1')).season.rounds.length, 3);
  const seasonSettled = await inspect(); await tick('?same');
  assert.deepEqual((await inspect()).stored, seasonSettled.stored);
  const learnedBrains = structuredClone(seasonSettled.state.brains);
  pub = await tick();
  assert.equal(pub.phase, 'deal'); assert.equal(pub.season.id, 2);
  assert.deepEqual(pub.balances, [10000, 10000, 10000, 10000, 10000]);
  assert.deepEqual(pub.debts, [0, 0, 0, 0, 0]);
  assert.deepEqual((await inspect()).state.brains, learnedBrains);
  assert.equal((await read('/api/seasons/1')).season.champion, seasonSettled.state.season.champion);
  assert.equal((await read('/api/seasons/current')).season.id, 2);
  const recent = await read('/api/rounds?limit=100');
  assert.equal(recent.rounds.length, 100); noSecrets(recent);
  const health = await read('/api/health');
  assert.equal(health.namespace, 'ddz-five-v1'); assert.equal(health.players, 5);
  assert.equal(health.seasonId, 2); assert.equal(health.seasons, 1);
  assert.equal(health.scheduling.steps, health.revision);
  assert.equal(health.scheduling.lateSteps, 0);
  const auditSnapshot = await inspect();
  const auditInput = { baseline: auditBaseline, health,
    matches: auditSnapshot.matches.map(row => JSON.parse(row.body)),
    seasons: auditSnapshot.seasons.map(row => JSON.parse(row.body)), now: health.phaseStart };
  const audit = evaluateAudit(auditInput);
  assert.equal(audit.status, 'in-progress', JSON.stringify({ failures: audit.failures, gaps: audit.timingGaps }));
  assert.equal(audit.cardPlaysChecked, health.plays);
  assert.equal(evaluateAudit({ ...auditInput, matches: auditInput.matches.slice(1) }).status, 'needs-attention');
  assert.equal(evaluateAudit({ ...auditInput, health: { ...health, createdAt: health.createdAt + 1 } }).status, 'needs-attention');
  const delayedHealth = { ...health, scheduling: { ...health.scheduling, lateSteps: 1, maxDelayMs: 3500, totalDelayMs: 3500 } };
  assert.equal(evaluateAudit({ ...auditInput, health: delayedHealth }).status, 'needs-attention');
  assert.equal(evaluateAudit({ ...auditInput, now: initial.state.createdAt + 86400000 }).status, 'needs-attention', 'A stale health snapshot cannot pass merely because 24 hours elapsed');
  const peakCheckpointBytes = (await inspect()).peakCheckpointBytes;
  assert.ok(peakCheckpointBytes < 1500000, 'Season checkpoint approaches the SQLite 2MB value limit');
  const fractional = await mf.dispatchFetch('https://arena.test/api/rounds?limit=1.5'); assert.equal(fractional.status, 200);
  const invalidId = await mf.dispatchFetch('https://arena.test/api/matches/999999999999999999999999'); assert.equal(invalidId.status, 400);
  const ids = await mf.listDurableObjectIds('ARENA', 'review'); assert.equal(ids.length, 1, 'Legacy namespace was accidentally initialized');
  await tick('?late=3500');
  const delayed = await read('/api/health');
  assert.equal(delayed.scheduling.lateSteps, 1); assert.equal(delayed.scheduling.maxDelayMs, 3500);
  const delayedCheckpoint = (await inspect()).stored;
  await tick('?same'); assert.deepEqual((await inspect()).stored, delayedCheckpoint);
  // Seed only a second, disposable test object with the actual legacy schema.
  // A deployment must cancel old alarms without rewriting the old experiment.
  const legacyState = await read('/__legacy/seed');
  const beforeRetirement = await read('/__legacy/inspect');
  assert.ok(beforeRetirement.alarm);
  const currentBeforeRetirement = await inspect();
  await mf.unsafeEvictDurableObject('review', 'FlyArena', { name: 'main-v1' });
  const retiredResponse = await mf.dispatchFetch('https://arena.test/__legacy/state');
  assert.equal(retiredResponse.status, 410);
  const retirement = await retiredResponse.json();
  assert.equal(retirement.retired, true); assert.ok(retirement.newGameURL.startsWith('https://'));
  const retired = await read('/__legacy/inspect');
  assert.equal(retired.retired, true); assert.equal(retired.alarm, null);
  assert.deepEqual(retired.state, legacyState); assert.deepEqual(retired.stored, legacyState);
  assert.deepEqual(retired.rounds, beforeRetirement.rounds);
  assert.deepEqual(await read('/__legacy/alarm'), retired, 'Retired alarm still mutated data');
  assert.deepEqual((await inspect()).stored, currentBeforeRetirement.stored, 'Legacy retirement changed the new experiment');
  console.log(JSON.stringify({ storageValidation: 'five-player SQLite checkpoint, failed match and season rollback, duplicate alarms, private-role isolation, compact complete replay, two observers, neural deltas, hibernation, natural season reset and legacy retirement passed', matches: health.matches, plays: health.plays, seasons: health.seasons, checkpointBytes: Buffer.byteLength(JSON.stringify(seasonSettled.state)), peakCheckpointBytes, largestDeltaBytes }));
} finally { await mf.dispose(); }
