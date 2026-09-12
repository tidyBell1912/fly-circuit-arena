import { DurableObject } from 'cloudflare:workers';
import { createArena, advanceArena, publicArena, GAME_MODEL as MODEL } from '../src/doudizhu-arena.js';

const ARENA_NAME = 'ddz-five-v1';
const MATCH_RETENTION = 1001;
const SEASON_RETENTION = 100;
const privateKeys = new Set(['privatePartner', 'dealRng', 'rng', 'gains', 'credits', 'recentCredits', 'features']);
// Public roles are decided by publicArena. This extra serialization boundary also
// excludes raw policy state and a candidate label that could identify a hidden ally.
function safePublic(value) {
  if (Array.isArray(value)) return value.map(safePublic);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !privateKeys.has(key))
    .map(([key, item]) => [key, key === 'label' && item === 'support-known-ally' ? 'conserve' : safePublic(item)]));
}
const publicState = state => ({ ...safePublic(publicArena(state)), neuralMode: 'full' });
function compactMatch(match, traceCount = 0) {
  return { ...match, plays: match.plays.map((play, i) => {
    const { candidates, trace, ...record } = play;
    if (i >= match.plays.length - traceCount && trace) record.trace = trace;
    return record;
  }), bids: match.bids.map(({ candidates, trace, ...bid }) => bid) };
}
function compactState(state) {
  state.match = compactMatch(state.match, 2);
  state.match.seasonId ??= state.season.id;
  state.match.seasonRound ??= state.season.round;
  state.match.seasonHand ??= state.season.hand;
  state.match.model ??= MODEL.version;
  state.scheduling ??= { steps: 0, lateSteps: 0, maxDelayMs: 0, totalDelayMs: 0, firstObservedAt: state.createdAt };
}
const matchOverview = ({ plays, bids, feedback, transfers, ...summary }) => ({ ...summary, playCount: plays.length });

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

export class FlyArena extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.state = null;
    this.retired = false;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, body TEXT NOT NULL)');
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS seasons (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, body TEXT NOT NULL)');
      this.state = await ctx.storage.get('state');
      if (!this.state) {
        this.state = createArena(Date.now(), crypto.getRandomValues(new Uint32Array(1))[0]);
        compactState(this.state);
        await ctx.storage.put('state', this.state);
      }
      // Retire only the known Sugar Heist schema. Keep its checkpoint and tables
      // intact, while cancelling its old self-scheduled alarms after deployment.
      if (this.state.schema === 1 && this.state.model === 'malecns-mb-v1.0.0') {
        this.retired = true;
        await ctx.storage.deleteAlarm();
        for (const ws of ctx.getWebSockets()) {
          try { ws.close(1012, 'This experiment retired; reload for the new table'); } catch {}
        }
        return;
      }
      if (this.state.model !== MODEL.version) throw new Error('Model version mismatch. Use a new arena namespace for a new experiment.');
      if (this.state.schema !== 2 || this.state.namespace !== ARENA_NAME) throw new Error('Arena schema or namespace mismatch');
      if (await ctx.storage.getAlarm() === null) await ctx.storage.setAlarm(Math.max(Date.now() + 100, this.state.deadline));
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    });
  }

  async step() {
    if (this.retired) return;
    return this.ctx.blockConcurrencyWhile(async () => {
      const now = Date.now();
      const next = structuredClone(this.state);
      let event;
      try { event = advanceArena(next, now); }
      catch (e) {
        // A failed neural decision is visible; never replace it with a fabricated winner.
        this.state.error = 'Circuit calculation paused. The last confirmed result is preserved.';
        await this.ctx.storage.put('state', this.state);
        this.broadcast();
        throw e;
      }
      if (!event) {
        await this.ctx.storage.setAlarm(Math.max(now + 100, this.state.deadline));
        return;
      }
      compactState(next);
      const delayMs = Math.max(0, now - event.scheduledAt);
      next.scheduling.steps++;
      next.scheduling.lateSteps += Number(delayMs > 2500);
      next.scheduling.maxDelayMs = Math.max(next.scheduling.maxDelayMs, delayMs);
      next.scheduling.totalDelayMs += delayMs;
      await this.ctx.storage.transaction(async tx => {
        // Current plays already live in the persistent checkpoint. Avoid a second
        // per-play table: checkpoint + alarm use two SQLite row writes per step.
        if (event.match) {
          const archived = safePublic(compactMatch({ ...event.match, seasonId: next.season.id,
            seasonRound: next.season.round, seasonHand: next.season.hand, model: MODEL.version }));
          this.ctx.storage.sql.exec('INSERT OR IGNORE INTO matches (id, created_at, body) VALUES (?, ?, ?)', archived.id, now, JSON.stringify(archived));
          this.ctx.storage.sql.exec('DELETE FROM matches WHERE id <= ?', archived.id - MATCH_RETENTION);
        }
        if (event.season) {
          this.ctx.storage.sql.exec('INSERT OR IGNORE INTO seasons (id, created_at, body) VALUES (?, ?, ?)', event.season.id, now, JSON.stringify(safePublic({ ...event.season, model: MODEL.version })));
          this.ctx.storage.sql.exec('DELETE FROM seasons WHERE id <= ?', event.season.id - SEASON_RETENTION);
        }
        // Round summaries are bounded to three entries in each season checkpoint
        // and are archived with that season, without redundant summary-row writes.
        await tx.put('state', next);
        await tx.setAlarm(next.deadline);
      });
      const previousNeural = this.state.lastNeural || [];
      this.state = next;
      this.broadcast(previousNeural);
    });
  }

  async alarm() { if (!this.retired) await this.step(); }

  broadcast(previousNeural = this.state.lastNeural || []) {
    if (this.retired) return;
    const data = publicState(this.state);
    // New viewers and explicit snapshots get all five last episodes. Ordinary
    // updates send only changed episodes; clients merge each non-null seat.
    data.neuralMode = 'delta';
    data.lastNeural = data.lastNeural.map((episode, seat) => {
      const previous = previousNeural[seat];
      return episode && (episode.at !== previous?.at || episode.decisionNumber !== previous?.decisionNumber)
        ? episode : null;
    });
    const payload = JSON.stringify({ type: 'state', data });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(payload); } catch { try { ws.close(1011, 'Reconnect for the latest state'); } catch {} }
    }
  }

  async fetch(request) {
    if (this.retired) return json({ retired: true, newGameURL: 'https://fly-circuit-arena.fly-circuit-arena.workers.dev/' }, 410);
    const url = new URL(request.url);
    if (url.pathname === '/internal/wake') {
      if (Date.now() >= this.state.deadline) await this.step();
      else if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(this.state.deadline);
      return json({ ok: true, revision: this.state.revision, deadline: this.state.deadline });
    }
    if (url.pathname === '/api/live') {
      if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket required' }, 426);
      if (this.ctx.getWebSockets().length >= 500) return json({ error: 'Live room is full. Please try again shortly.' }, 503);
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.ctx.acceptWebSocket(server);
      server.send(JSON.stringify({ type: 'state', data: publicState(this.state) }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/api/state') return json(publicState(this.state));
    if (url.pathname === '/api/health') return json({ ok: !this.state.error && Date.now() < this.state.deadline + 60000,
      model: MODEL.version, namespace: ARENA_NAME, schema: this.state.schema, game: MODEL.game, players: 5,
      revision: this.state.revision, phase: this.state.phase, phaseStart: this.state.phaseStart,
      deadline: this.state.deadline, rounds: this.state.stats.rounds, plays: this.state.stats.rounds,
      matches: this.state.stats.matches, matchId: this.state.match.id, playedThisMatch: this.state.match.plays.length,
      seasons: this.state.stats.seasons, seasonId: this.state.season.id, seasonRound: this.state.season.round,
      seasonHand: this.state.season.hand, scheduling: this.state.scheduling, createdAt: this.state.createdAt });
    if (url.pathname === '/api/matches/current') return json({ match: publicState(this.state).match, model: MODEL });
    if (url.pathname === '/api/matches') {
      const rows = this.ctx.storage.sql.exec('SELECT body FROM matches ORDER BY id DESC LIMIT 30').toArray();
      return json({ matches: rows.map(r => matchOverview(JSON.parse(r.body))), current: this.state.match.id });
    }
    const match = url.pathname.match(/^\/api\/matches\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);
      if (!Number.isSafeInteger(id) || id < 1) return json({ error: 'Invalid match identifier' }, 400);
      if (id === this.state.match.id) return json({ match: publicState(this.state).match, model: MODEL });
      const row = this.ctx.storage.sql.exec('SELECT body FROM matches WHERE id = ?', id).toArray()[0];
      return row ? json({ match: JSON.parse(row.body), model: MODEL }) : json({ error: 'Match not found' }, 404);
    }
    if (url.pathname === '/api/rounds') {
      const limit = Math.floor(Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20)));
      const rounds = [...publicState(this.state).match.plays].reverse().slice(0, limit);
      if (rounds.length < limit) {
        const rows = this.ctx.storage.sql.exec('SELECT body FROM matches WHERE id < ? ORDER BY id DESC LIMIT 30', this.state.match.id).toArray();
        for (const row of rows) {
          rounds.push(...JSON.parse(row.body).plays.slice().reverse().slice(0, limit - rounds.length));
          if (rounds.length >= limit) break;
        }
      }
      return json({ rounds, kind: 'card-plays' });
    }
    if (url.pathname === '/api/seasons/current') return json({ season: { ...publicState(this.state).season, model: MODEL.version }, model: MODEL });
    if (url.pathname === '/api/seasons') {
      const rows = this.ctx.storage.sql.exec('SELECT body FROM seasons ORDER BY id DESC LIMIT 30').toArray();
      return json({ seasons: rows.map(r => JSON.parse(r.body)), current: this.state.season.id });
    }
    const season = url.pathname.match(/^\/api\/seasons\/(\d+)$/);
    if (season) {
      const id = Number(season[1]);
      if (!Number.isSafeInteger(id) || id < 1) return json({ error: 'Invalid season identifier' }, 400);
      if (id === this.state.season.id) return json({ season: { ...publicState(this.state).season, model: MODEL.version }, model: MODEL });
      const row = this.ctx.storage.sql.exec('SELECT body FROM seasons WHERE id = ?', id).toArray()[0];
      return row ? json({ season: JSON.parse(row.body), model: MODEL }) : json({ error: 'Season not found' }, 404);
    }
    return json({ error: 'Not found' }, 404);
  }

  webSocketMessage(ws, message) {
    if (this.retired) { try { ws.close(1012, 'Experiment retired'); } catch {} return; }
    // Spectators cannot submit moves or modify the experiment.
    if (message === 'snapshot') ws.send(JSON.stringify({ type: 'state', data: publicState(this.state) }));
    else if (message !== 'ping') ws.close(1008, 'Read-only experiment');
  }
  webSocketClose(ws, code) { try { ws.close(code); } catch {} }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/locale') {
      const country = request.cf?.country;
      const byCountry = { CN:'zh',HK:'zh',MO:'zh',TW:'zh',KR:'ko',JP:'ja',VN:'vi' };
      const browser = request.headers.get('Accept-Language')?.split(',')[0].slice(0,2).toLowerCase();
      return json({ language: country ? (byCountry[country] || 'en') : (['zh','ko','ja','vi'].includes(browser) ? browser : 'en'), source: country ? 'country' : 'browser' });
    }
    if (url.pathname.startsWith('/api/')) {
      if (request.method !== 'GET') return json({ error: 'This experiment is read-only' }, 405);
      if (url.pathname === '/api/live') {
        const origin = request.headers.get('Origin');
        if (origin && origin !== url.origin) return json({ error: 'Origin not allowed' }, 403);
      }
      return env.ARENA.getByName(ARENA_NAME).fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(env.ARENA.getByName(ARENA_NAME).fetch('https://arena/internal/wake'));
  },
};
