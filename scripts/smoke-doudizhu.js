// Read-only observer smoke check for an arena you operate.
// Usage: node scripts/smoke-doudizhu.js [base URL] [2..50 viewers] [15..60 seconds]
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import circuit from '../data/circuit.json' with { type: 'json' };
import { MODEL as BRAIN_MODEL } from '../src/brain.js';

const version = 'ddz-five-v1.0.0', namespace = 'ddz-five-v1';
const outputPath = 'artifacts/validation/doudizhu-live-smoke.json';
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const integer = value => Number.isSafeInteger(value) && value >= 0;
const five = value => Array.isArray(value) && value.length === 5;
const sourceRoles = new Map(circuit.nodes.map(node => [node.bodyId, node.role]));
const expectedRoles = { PN: 131, KC: 850, MBON: 2, APL: 1 };
const columns = ['bodyId', 'role', 'spikeCount', 'rateHz', 'finalVoltage', 'finalActivity'];
const forbidden = /"(?:privatePartner|rng|dealRng|gains|features|credits|recentCredits)":/;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function validateNeural(episode) {
  assert.equal(episode.schema, 1); assert.equal(episode.durationMs, 160); assert.equal(episode.dtMs, 1);
  assert.ok(integer(episode.at)); assert.ok(integer(episode.decisionNumber));
  assert.deepEqual(episode.columns, columns); assert.equal(episode.voltageUnits, 'dimensionless model state');
  assert.equal(episode.neurons.length, 984); assert.equal(episode.anatomyOnly.length, 17);
  const rows = new Map(), roles = { PN: 0, KC: 0, MBON: 0, APL: 0 }, spikeCounts = new Map();
  for (const row of episode.neurons) {
    assert.equal(row.length, 6); const [id, role, count, rate, voltage, activity] = row;
    assert.equal(sourceRoles.get(id), role, 'Neuron does not match the pinned source graph');
    assert.ok(Object.hasOwn(roles, role)); assert.ok(!rows.has(id)); rows.set(id, row); roles[role]++;
    if (role === 'APL') {
      assert.equal(count, null); assert.equal(rate, null); assert.equal(voltage, null); assert.ok(Number.isFinite(activity));
    } else {
      assert.ok(integer(count)); assert.equal(rate, count * 1000 / 160); assert.equal(activity, null);
      if (role === 'PN') assert.equal(voltage, null); else assert.ok(Number.isFinite(voltage));
    }
  }
  assert.deepEqual(roles, expectedRoles);
  assert.equal(new Set(episode.anatomyOnly.map(([id]) => id)).size, 17);
  for (const [id, role] of episode.anatomyOnly) { assert.equal(role, 'DAN'); assert.equal(sourceRoles.get(id), 'DAN'); assert.ok(!rows.has(id)); }
  let previousTime = -1;
  for (const event of episode.spikes) {
    assert.equal(event.length, 2); const [time, id] = event;
    assert.ok(integer(time) && time < 160 && time >= previousTime); previousTime = time;
    assert.ok(rows.has(id) && rows.get(id)[1] !== 'APL'); spikeCounts.set(id, (spikeCounts.get(id) || 0) + 1);
  }
  for (const [id, role, count] of episode.neurons) if (role !== 'APL') assert.equal(spikeCounts.get(id) || 0, count, 'Spike raster and neuron count disagree');
  assert.equal(episode.analog.APL.length, 160);
  episode.analog.APL.forEach((sample, i) => { assert.equal(sample.length, 2); assert.equal(sample[0], i); assert.ok(Number.isFinite(sample[1])); });
  const apl = episode.neurons.find(row => row[1] === 'APL'); assert.equal(episode.analog.APL.at(-1)[1], apl[5]);
  return { decisionNumber: episode.decisionNumber, at: episode.at, neuronCount: 984, anatomyOnly: 17, spikeEvents: episode.spikes.length, roles };
}

export function validateMatch(match) {
  assert.ok(integer(match.id) && match.id > 0); assert.equal(match.model, version);
  assert.ok(Array.isArray(match.plays) && match.plays.length <= 540, 'Hand exceeds the 540-action bound');
  const spent = new Set();
  for (let i = 0; i < match.plays.length; i++) {
    const play = match.plays[i];
    assert.equal(play.id, `${match.id}-${i + 1}`); assert.equal(play.matchId, match.id); assert.equal(play.number, i + 1);
    assert.ok(integer(play.seat) && play.seat < 5); assert.equal(play.model, version); assert.ok(integer(play.at));
    assert.equal(typeof play.pass, 'boolean'); assert.ok(Array.isArray(play.cards));
    if (play.pass) assert.equal(play.cards.length, 0); else assert.ok(play.cards.length > 0);
    for (const card of play.cards) { assert.ok(integer(card) && card < 108); assert.ok(!spent.has(card), 'A physical card was played twice'); spent.add(card); }
  }
  if (match.completedAt !== null) {
    assert.ok(integer(match.winner) && match.winner < 5); assert.ok(five(match.pointsDelta));
    assert.equal(match.pointsDelta.reduce((sum, x) => sum + x, 0), 0); assert.ok(five(match.balancesAfter) && match.balancesAfter.every(integer));
  }
  return match.plays.length;
}

export async function main(args = process.argv.slice(2)) {
  const base = (args[0] || 'https://fly-circuit-arena.fly-circuit-arena.workers.dev').replace(/\/$/, '');
  const viewers = Number(args[1] || 2), seconds = Number(args[2] || 35);
  assert.ok(['http:', 'https:'].includes(new URL(base).protocol));
  assert.ok(Number.isInteger(viewers) && viewers >= 2 && viewers <= 50, 'Viewer count must be between 2 and 50');
  assert.ok(Number.isFinite(seconds) && seconds >= 15 && seconds <= 60, 'Observation duration must be 15..60 seconds');
  const report = { startedAt: new Date().toISOString(), base, viewers, observationSeconds: seconds, status: 'running', http: {}, errors: [],
    limitation: 'Short observer consistency and diagnostic-record smoke test from one machine. It does not measure worldwide latency, continuous availability, biological neural activity or learning improvement.' };
  const clients = [], expected = new Map(), episodes = new Map(), seatsObserved = new Set();
  let messages = 0, deltaMessages = 0, maxMessageBytes = 0;
  const get = async (path, expectedStatus = 200, options = {}) => {
    const response = await fetch(base + path, { ...options, signal: AbortSignal.timeout(15000) });
    report.http[(options.method || 'GET') + ' ' + path] = response.status;
    assert.equal(response.status, expectedStatus, path);
    return response.json();
  };
  const checkHealth = h => {
    assert.equal(h.ok, true); assert.equal(h.model, version); assert.equal(h.namespace, namespace);
    assert.equal(h.players, 5); assert.equal(h.schema, 2); assert.ok(integer(h.revision));
  };
  const stateHash = (data, client) => {
    assert.equal(data.model.version, version); assert.equal(data.model.namespace, namespace); assert.equal(data.model.graphHash, BRAIN_MODEL.graphHash);
    assert.ok(integer(data.revision)); assert.ok(five(data.players) && five(data.brains) && five(data.hands));
    for (const key of ['balances', 'debts', 'principal', 'loanCounts']) assert.ok(five(data[key]) && data[key].every(integer), 'Invalid five-player accounting: ' + key);
    data.players.forEach((player, seat) => { assert.equal(player.seat, seat); assert.equal(player.balance, data.balances[seat]); assert.equal(player.debt, data.debts[seat]); });
    const held = data.hands.flat(); assert.ok(held.every(card => integer(card) && card < 108)); assert.equal(new Set(held).size, held.length);
    assert.equal(data.error, null); validateMatch(data.match);
    assert.equal(forbidden.test(JSON.stringify(data)), false, 'Private policy state leaked');
    assert.equal(JSON.stringify(data).includes('support-known-ally'), false);
    if (!data.partnerRevealed && data.match.completedAt === null) { assert.equal(data.partner, null); assert.equal(data.identityCard, null); assert.equal(data.match.partner, null); }
    assert.ok(['full', 'delta'].includes(data.neuralMode)); assert.ok(five(data.lastNeural));
    if (client.createdAt !== data.createdAt) {
      assert.equal(data.neuralMode, 'full', 'A new arena requires a full snapshot'); client.neural = Array(5).fill(null); client.createdAt = data.createdAt;
    }
    if (data.neuralMode === 'full') client.neural = Array(5).fill(null);
    data.lastNeural.forEach((episode, seat) => {
      if (!episode) return;
      assert.ok(episode.at <= data.phaseStart); assert.ok(episode.decisionNumber <= data.brains[seat].decisions);
      const previous = client.neural[seat];
      if (previous) assert.ok(episode.decisionNumber >= previous.decisionNumber && episode.at >= previous.at, 'Neural episode went backwards');
      const key = `${data.createdAt}:${seat}:${episode.decisionNumber}:${episode.at}`, digest = hash(episode);
      if (episodes.has(key)) assert.equal(episodes.get(key).digest, digest, 'Conflicting neural data for one recorded decision');
      else episodes.set(key, { digest, seat, ...validateNeural(episode) });
      client.neural[seat] = { key, digest, decisionNumber: episode.decisionNumber, at: episode.at }; seatsObserved.add(seat);
    });
    const { serverTime, delayed, neuralMode, lastNeural, ...confirmed } = data;
    const digest = hash({ ...confirmed, lastNeural: client.neural.map(episode => episode?.digest || null) });
    const key = `${data.createdAt}:${data.revision}`;
    if (expected.has(key)) assert.equal(expected.get(key), digest, 'Different viewers received conflicting state at ' + key);
    expected.set(key, digest); return key;
  };
  const waitFor = async (predicate, ms = 5000) => {
    const end = Date.now() + ms;
    while (!predicate()) { if (Date.now() >= end) throw new Error('Timed out waiting for observer state'); await delay(25); }
  };
  try {
    report.before = await get('/api/health'); checkHealth(report.before);
    const initial = await get('/api/state'); assert.equal(initial.neuralMode, 'full'); stateHash(initial, { neural: [] });
    report.initial = { revision: initial.revision, seasonId: initial.season.id, balances: initial.balances, debts: initial.debts, playedThisHand: initial.match.plays.length };
    const current = await get('/api/matches/current'); assert.equal(current.model.version, version); report.checkedCurrentPlays = validateMatch(current.match);
    const archive = await get('/api/matches'); assert.ok(archive.matches.length <= 30);
    if (archive.matches.length) {
      const latest = await get('/api/matches/' + archive.matches[0].id); report.checkedArchivedPlays = validateMatch(latest.match);
    }
    const season = await get('/api/seasons/current'); assert.equal(season.model.version, version); assert.ok(season.season.rounds.length <= 3);
    const seasons = await get('/api/seasons'); assert.ok(seasons.seasons.length <= 30);
    // These payloads have no defined mutation semantics. The public boundary must
    // reject the HTTP method and close an unsupported WS message without acting.
    await get('/api/state', 405, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    await get('/api/move', 404);
    await Promise.all(Array.from({ length: viewers }, (_, i) => new Promise((resolve, reject) => {
      const ws = new WebSocket(base.replace(/^http/, 'ws') + '/api/live');
      const client = { ws, index: i, messages: 0, fullMessages: 0, deltaMessages: 0, revisions: [], neural: [], closeCode: null }; clients.push(client);
      const timeout = setTimeout(() => reject(new Error(`Viewer ${i} handshake timed out`)), 15000);
      ws.addEventListener('message', event => {
        if (event.data === 'pong') return;
        try {
          const message = JSON.parse(event.data); assert.equal(message.type, 'state');
          const data = message.data, key = stateHash(data, client);
          if (client.revisions.length) assert.ok(data.revision >= client.lastRevision, 'State revision went backwards');
          client.lastRevision = data.revision; client.revisions.push(key); client.messages++; messages++;
          if (data.neuralMode === 'full') client.fullMessages++;
          if (data.neuralMode === 'delta') { client.deltaMessages++; deltaMessages++; }
          maxMessageBytes = Math.max(maxMessageBytes, Buffer.byteLength(event.data));
          if (client.messages === 1) { assert.equal(data.neuralMode, 'full'); clearTimeout(timeout); resolve(); }
        } catch (error) { report.errors.push(`Viewer ${i}: ${error.message}`); clearTimeout(timeout); reject(error); }
      });
      ws.addEventListener('error', () => { const error = `Viewer ${i} connection failed`; report.errors.push(error); clearTimeout(timeout); reject(new Error(error)); });
      ws.addEventListener('close', event => { client.closeCode = event.code; clearTimeout(timeout); if (!client.messages) reject(new Error(`Viewer ${i} closed before its initial snapshot`)); });
    })));
    await delay(seconds * 1000);
    assert.equal(report.errors.length, 0, report.errors.join('; '));
    assert.ok(clients.every(client => client.ws.readyState === WebSocket.OPEN), 'An observer disconnected during observation');
    assert.ok(clients.every(client => client.messages > 1 && client.deltaMessages > 0), 'Each observer must receive ongoing incremental updates');
    const shared = [...new Set(clients[0].revisions)].filter(key => clients.every(client => client.revisions.includes(key)));
    assert.ok(shared.length >= 2, 'Need at least two revisions shared by every observer');
    report.sharedRevisions = shared.length; report.lastSharedRevision = shared.at(-1); report.lastSharedFingerprint = expected.get(shared.at(-1));
    const snapshotCount = clients[0].fullMessages; clients[0].ws.send('snapshot');
    await waitFor(() => clients[0].fullMessages > snapshotCount);
    const probe = clients.at(-1); probe.ws.send('{"type":"unsupported-smoke-probe"}');
    await waitFor(() => probe.closeCode !== null); assert.equal(probe.closeCode, 1008); report.unsupportedWebSocketMessageCloseCode = probe.closeCode;
    report.after = await get('/api/health'); checkHealth(report.after);
    assert.equal(report.after.createdAt, report.before.createdAt); assert.ok(report.after.revision > report.before.revision);
    assert.ok(report.after.plays > report.before.plays, 'No actual card play advanced during observation');
    const final = await get('/api/state'); stateHash(final, { neural: [] });
    assert.equal(seatsObserved.size, 5, 'Need a validated last-decision record from every fly');
    const rounds = await get('/api/rounds?limit=200');
    assert.equal(rounds.kind, 'card-plays'); assert.ok(rounds.rounds.length > 0 && rounds.rounds.length <= 100);
    assert.equal(new Set(rounds.rounds.map(play => play.id)).size, rounds.rounds.length);
    for (const play of rounds.rounds) { assert.equal(play.model, version); assert.ok(integer(play.number) && play.number >= 1 && play.number <= 540); }
    report.checkedRecentPlays = rounds.rounds.length; report.status = 'passed';
  } catch (error) { report.errors.push(error.message); report.status = 'failed'; process.exitCode = 1; }
  finally {
    for (const client of clients) if (client.ws.readyState === WebSocket.OPEN || client.ws.readyState === WebSocket.CONNECTING) client.ws.close(1000, 'Smoke check complete');
    report.completedAt = new Date().toISOString(); report.messages = messages; report.deltaMessages = deltaMessages; report.maxMessageBytes = maxMessageBytes;
    report.distinctRevisions = expected.size; report.neuralEpisodesChecked = episodes.size; report.neuralSeatsObserved = [...seatsObserved].sort();
    report.observers = clients.map(({ index, messages, fullMessages, deltaMessages, revisions }) => ({ index, messages, fullMessages, deltaMessages, distinctRevisions: new Set(revisions).size }));
    report.lastNeuralEvidence = [0, 1, 2, 3, 4].map(seat => [...episodes.values()].filter(episode => episode.seat === seat).sort((a, b) => b.at - a.at)[0] || null);
    report.errors = [...new Set(report.errors)]; await mkdir('artifacts/validation', { recursive: true });
    await writeFile(outputPath, JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ status: report.status, base, viewers, messages, sharedRevisions: report.sharedRevisions, neuralEpisodesChecked: episodes.size, errors: report.errors, report: outputPath }));
  }
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
