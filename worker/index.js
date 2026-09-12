import { DurableObject } from 'cloudflare:workers';
import { createArena, advanceArena, publicArena } from '../src/arena.js';
import { MODEL } from '../src/brain.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });

export class FlyArena extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx = ctx;
    this.env = env;
    this.state = null;
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS rounds (id TEXT PRIMARY KEY, match_id INTEGER NOT NULL, created_at INTEGER NOT NULL, body TEXT NOT NULL)');
      ctx.storage.sql.exec('CREATE INDEX IF NOT EXISTS rounds_time ON rounds(created_at)');
      ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS matches (id INTEGER PRIMARY KEY, created_at INTEGER NOT NULL, body TEXT NOT NULL)');
      this.state = await ctx.storage.get('state');
      if (!this.state) {
        this.state = createArena(Date.now(), crypto.getRandomValues(new Uint32Array(1))[0]);
        await ctx.storage.put('state', this.state);
      }
      if (this.state.model !== MODEL.version) throw new Error('Model version mismatch. Use a new arena namespace for a new experiment.');
      if (await ctx.storage.getAlarm() === null) await ctx.storage.setAlarm(Math.max(Date.now() + 100, this.state.deadline));
      ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    });
  }

  async step() {
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
      await this.ctx.storage.transaction(async tx => {
        if (event.round) this.ctx.storage.sql.exec('INSERT OR IGNORE INTO rounds (id, match_id, created_at, body) VALUES (?, ?, ?, ?)', event.round.id, event.round.matchId, now, JSON.stringify(event.round));
        if (event.match) {
          this.ctx.storage.sql.exec('INSERT OR IGNORE INTO matches (id, created_at, body) VALUES (?, ?, ?)', event.match.id, now, JSON.stringify(event.match));
          this.ctx.storage.sql.exec('DELETE FROM rounds WHERE created_at < ?', now - 14 * 86400000);
          this.ctx.storage.sql.exec('DELETE FROM matches WHERE id < ?', event.match.id - 1000);
        }
        await tx.put('state', next);
        await tx.setAlarm(next.deadline);
      });
      this.state = next;
      this.broadcast();
    });
  }

  async alarm() { await this.step(); }

  broadcast() {
    const payload = JSON.stringify({ type: 'state', data: publicArena(this.state) });
    for (const ws of this.ctx.getWebSockets()) {
      try { ws.send(payload); } catch { try { ws.close(1011, 'Reconnect for the latest state'); } catch {} }
    }
  }

  async fetch(request) {
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
      server.send(JSON.stringify({ type: 'state', data: publicArena(this.state) }));
      return new Response(null, { status: 101, webSocket: client });
    }
    if (url.pathname === '/api/state') return json(publicArena(this.state));
    if (url.pathname === '/api/health') return json({ ok: !this.state.error && Date.now() < this.state.deadline + 60000, model: MODEL.version, revision: this.state.revision, phase: this.state.phase, deadline: this.state.deadline, rounds: this.state.stats.rounds, matches: this.state.stats.matches, createdAt: this.state.createdAt });
    if (url.pathname === '/api/matches') {
      const rows = this.ctx.storage.sql.exec('SELECT body FROM matches ORDER BY id DESC LIMIT 30').toArray();
      return json({ matches: rows.map(r => JSON.parse(r.body)), current: this.state.match.id });
    }
    const match = url.pathname.match(/^\/api\/matches\/(\d+)$/);
    if (match) {
      const id = Number(match[1]);
      if (id === this.state.match.id) return json({ match: this.state.match, model: MODEL });
      const row = this.ctx.storage.sql.exec('SELECT body FROM matches WHERE id = ?', id).toArray()[0];
      return row ? json({ match: JSON.parse(row.body), model: MODEL }) : json({ error: 'Match not found' }, 404);
    }
    if (url.pathname === '/api/rounds') {
      const limit = Math.floor(Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 20)));
      return json({ rounds: this.ctx.storage.sql.exec('SELECT body FROM rounds ORDER BY created_at DESC LIMIT ?', limit).toArray().map(r => JSON.parse(r.body)) });
    }
    return json({ error: 'Not found' }, 404);
  }

  webSocketMessage(ws, message) {
    // Spectators cannot submit moves or modify the experiment.
    if (message === 'snapshot') ws.send(JSON.stringify({ type: 'state', data: publicArena(this.state) }));
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
      return env.ARENA.getByName('main-v1').fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(env.ARENA.getByName('main-v1').fetch('https://arena/internal/wake'));
  },
};
