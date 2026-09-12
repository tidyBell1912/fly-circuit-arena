import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';

const project = new URL('../', import.meta.url).pathname.slice(0, -1);
let source = await fs.readFile(project + '/worker/index.js', 'utf8');
source = source.replaceAll('Date.now()', '__clockNow()');
source = `let __clock = ${Date.now() + 365 * 86400000}; const __clockNow = () => __clock;\n` + source;
source = source.replace("const url = new URL(request.url);", `const url = new URL(request.url);
    if (url.pathname === '/api/__test/tick') {
      if (!url.searchParams.has('same')) __clock = this.state.deadline;
      this.__failTransaction = url.searchParams.has('fail');
      await this.step();
      return json(publicArena(this.state, __clock));
    }
    if (url.pathname === '/api/__test/inspect') {
      return json({ state: this.state, stored: await this.ctx.storage.get('state'),
        rows: this.ctx.storage.sql.exec('SELECT body FROM rounds ORDER BY id').toArray(),
        alarm: await this.ctx.storage.getAlarm() });
    }`);
source = source.replace("await tx.put('state', next);", "if (this.__failTransaction) throw new Error('Injected transaction failure');\n        await tx.put('state', next);");
const bundled = await build({ stdin: { contents: source, resolveDir: project + '/worker', sourcefile: 'review-worker.js' }, bundle: true, write: false, format: 'esm', platform: 'neutral', external: ['cloudflare:workers'] });
const mf = new Miniflare(convertV4MiniflareOptions({ name: 'review', modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-09-12', durableObjects: { ARENA: { className: 'FlyArena', useSQLite: true } }, log: new Log(LogLevel.NONE) }));
const read = async path => { const r = await mf.dispatchFetch('https://arena.test' + path); assert.equal(r.status, 200, path); return r.json(); };
const tick = query => read('/api/__test/tick' + (query || ''));
const inspect = () => read('/api/__test/inspect');
try {
  let state = await read('/api/state');
  assert.equal(state.phase, 'intro');
  const start = await inspect();
  assert.deepEqual(start.state, start.stored);
  let pub;
  for (const expected of ['predict', 'think', 'sealed']) {
    pub = await tick();
    assert.equal(pub.phase, expected);
    assert.equal(pub.currentRound, null);
    assert.equal(pub.lastRound, null);
    const str = JSON.stringify(pub);
    assert.equal(/"(?:rng|gains|features|pending|prediction)":/.test(str), false, 'Unrevealed decision leaked');
    const before = await inspect();
    const repeated = await tick('?same');
    assert.equal(repeated.revision, pub.revision);
    const after = await inspect();
    assert.deepEqual(after.state, before.state, 'Duplicate alarm mutated state');
    assert.deepEqual(after.stored, before.stored, 'Duplicate alarm persisted duplicate');
  }
  pub = await tick();
  assert.equal(pub.phase, 'reveal');
  assert.equal(pub.match.score.reduce((a,b)=>a+b), 1);
  assert.equal(pub.stats.rounds, 0);
  const beforeFailure = await inspect();
  const failed = await mf.dispatchFetch('https://arena.test/api/__test/tick?fail');
  assert.equal(failed.status, 500);
  const afterFailure = await inspect();
  assert.deepEqual(afterFailure.stored, beforeFailure.stored, 'Transaction failed to rollback state');
  assert.equal(afterFailure.rows.length, 0, 'SQL round insert survived rollback');
  pub = await tick();
  assert.equal(pub.phase, 'feedback');
  assert.equal(pub.stats.rounds, 1);
  assert.equal(pub.stats.predictions, 1);
  let snapshot = await inspect();
  assert.deepEqual(snapshot.state, snapshot.stored, 'Published state differs from persisted');
  assert.equal(snapshot.rows.length, 1);
  assert.deepEqual(snapshot.state.brains.map(b=>b.updates), [1,1,1]);
  await tick('?same');
  snapshot = await inspect();
  assert.equal(snapshot.rows.length, 1);
  assert.equal(snapshot.state.stats.rounds, 1);
  assert.deepEqual(snapshot.state.brains.map(b=>b.updates), [1,1,1]);
  while ((await inspect()).state.phase !== 'recap') await tick();
  snapshot = await inspect();
  assert.equal(snapshot.rows.length, 5);
  assert.equal(snapshot.state.match.score.reduce((a,b)=>a+b), 5);
  assert.equal(snapshot.state.stats.matches, 1);
  assert.ok([0,1].includes(snapshot.state.match.winner));
  const sockets = [];
  const messages = [];
  for (let i = 0; i < 2; i++) {
    const r = await mf.dispatchFetch('https://arena.test/api/live', { headers: { Upgrade:'websocket', Origin:'https://arena.test' } });
    assert.equal(r.status, 101);
    const ws = r.webSocket;
    messages[i] = [];
    ws.addEventListener('message', e => messages[i].push(e.data));
    ws.accept();
    sockets.push(ws);
  }
  const waitFor = async predicate => { for (let i=0;i<100;i++) { if (predicate()) return; await new Promise(r=>setTimeout(r,10)); } throw new Error('Timed out waiting for WS'); };
  await waitFor(()=>messages.every(m=>m.length));
  const stableState = data => { const {serverTime, ...rest}=data; return rest; };
  assert.deepEqual(stableState(JSON.parse(messages[0][0]).data), stableState(JSON.parse(messages[1][0]).data), 'Two spectators saw different state');
  const cross = await mf.dispatchFetch('https://arena.test/api/live', { headers: { Upgrade:'websocket', Origin:'https://evil.test' } });
  assert.equal(cross.status,403);
  const beforeEvict = await inspect();
  await mf.unsafeEvictDurableObject('review', 'FlyArena', { name:'main-v1', webSockets:'hibernate' });
  sockets[0].send('ping');
  await waitFor(()=>messages[0].includes('pong'));
  sockets[0].send('snapshot');
  await waitFor(()=>messages[0].length>=3);
  const afterEvict = await inspect();
  assert.deepEqual(afterEvict.state,beforeEvict.state,'Hibernation changed arena state');
  assert.deepEqual(afterEvict.stored,beforeEvict.stored,'Hibernation changed durable state');
  let closeCode;
  sockets[1].addEventListener('close', e=>closeCode=e.code);
  sockets[1].send('{"action":1}');
  await waitFor(()=>closeCode!==undefined);
  assert.equal(closeCode,1008);
  sockets[0].close(1000,'Test complete');
  const fractional = await mf.dispatchFetch('https://arena.test/api/rounds?limit=1.5');
  assert.equal(fractional.status, 200);
  console.log(JSON.stringify({checks:'rollback, persistent state agreement, duplicate deadline, choice privacy, five-round match, two spectator agreement, cross-origin rejection, WebSocket hibernation, ping, mutation rejection: passed', fractionalLimitStatus:fractional.status, stateBytes:Buffer.byteLength(JSON.stringify(snapshot.state)), matchBytes:Buffer.byteLength(JSON.stringify(snapshot.state.match))}));
} finally { await mf.dispose(); }
