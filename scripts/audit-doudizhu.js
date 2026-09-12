import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { classifyMove, beats } from '../src/doudizhu-rules.js';

const base = 'https://fly-circuit-arena.fly-circuit-arena.workers.dev';
const baselinePath = 'artifacts/validation/ddz-soak-start.json';
const reportPath = 'artifacts/validation/ddz-soak-report.json';
const toleranceMs = 2500;
export const protocol = { model: 'ddz-five-v1.0.0', namespace: 'ddz-five-v1', playMs: 3000, bombMs: 5000, targetHours: 24 };
const limitation = 'Audit of durable game records and persisted scheduling counters; not an external continuous reachability measurement.';
const integer = x => Number.isSafeInteger(x) && x >= 0;
const seat = x => integer(x) && x < 5;
const five = x => Array.isArray(x) && x.length === 5;
const phaseDurations = { deal: [6000], bid: [3000], play: [3000, 5000], settle: [12000], roundEnd: [12000], loanPositive: [4000], loanNegative: [6000], seasonEnd: [15000] };

/** No network or writes: exported so fabricated failure cases can be checked independently. */
export function evaluateAudit({ baseline, health, matches = [], partialMatch = null, seasons = [], fetchFailures = [], now = Date.now() }) {
  const failures = [...fetchFailures], gaps = [];
  const fail = message => failures.push(message);
  const gap = (scope, actual, expected) => {
    if (actual > expected + toleranceMs) gaps.push({ ...scope, extraMs: actual - expected });
    if (actual < expected - toleranceMs) fail('Unexpectedly short game interval: ' + JSON.stringify(scope));
  };
  const started = Date.parse(baseline?.checkedAt), elapsedMs = now - started;
  const validHealth = h => h && ['revision', 'plays', 'matches', 'seasons', 'matchId', 'playedThisMatch', 'seasonId'].every(k => integer(h[k]));
  if (!Number.isFinite(started) || !Number.isFinite(now) || elapsedMs < 0) fail('Invalid audit time window');
  if (baseline?.createdAt > started + toleranceMs) fail('Baseline predates arena creation');
  for (const [label, h] of [['baseline', baseline], ['current', health]]) {
    if (!validHealth(h)) fail('Invalid ' + label + ' counters');
    if (!h?.ok) fail('Unhealthy ' + label + ' arena');
    if (h?.model !== protocol.model || h?.namespace !== protocol.namespace || h?.schema !== 2 || h?.players !== 5) fail('Unexpected ' + label + ' game identity');
    if (!Number.isFinite(h?.createdAt) || h?.createdAt > now) fail('Invalid ' + label + ' creation timestamp');
    const schedule = h?.scheduling;
    if (!schedule || !['steps', 'lateSteps', 'maxDelayMs', 'totalDelayMs'].every(k => integer(schedule[k])) || schedule.lateSteps > schedule.steps || schedule.steps !== h?.revision || schedule.firstObservedAt !== h?.createdAt) fail('Incomplete ' + label + ' scheduling evidence');
    if (validHealth(h) && ![h.matches, h.matches + 1].includes(h.matchId)) fail('Inconsistent ' + label + ' active match');
  }
  if (baseline?.createdAt !== health?.createdAt) fail('Arena instance changed since baseline');
  const countersValid = validHealth(baseline) && validHealth(health);
  if (countersValid) {
    for (const key of ['revision', 'plays', 'matches', 'seasons']) if (health[key] < baseline[key]) fail('Counter regressed: ' + key);
    if (elapsedMs > 60000 && (health.plays === baseline.plays || health.revision === baseline.revision)) fail('No actual card-play or revision progress');
    if (elapsedMs >= 86400000 && (health.matches === baseline.matches || health.seasons === baseline.seasons)) fail('No completed match or season progress over 24 hours');
  }
  if (baseline?.scheduling && health?.scheduling) {
    for (const key of ['steps', 'lateSteps', 'maxDelayMs', 'totalDelayMs']) if (health.scheduling[key] < baseline.scheduling[key]) fail('Scheduling counter regressed: ' + key);
    if (health.scheduling.lateSteps > baseline.scheduling.lateSteps) fail('One or more state transitions were over 2.5 seconds late');
    if (health.scheduling.steps - baseline.scheduling.steps !== health?.revision - baseline?.revision) fail('Scheduling evidence does not cover every revision');
  }
  const durations = phaseDurations[health?.phase];
  if (!durations || !Number.isFinite(health?.phaseStart) || !Number.isFinite(health?.deadline) || !durations.includes(health.deadline - health.phaseStart)) fail('Invalid active phase schedule');
  if (health?.phaseStart > now + toleranceMs) fail('Active phase starts in the future');
  if (now > health?.deadline + toleranceMs) gaps.push({ type: 'overdue-current-phase', extraMs: now - health.deadline });

  if (!Array.isArray(matches)) { fail('Malformed match collection'); matches = []; }
  if (!Array.isArray(seasons)) { fail('Malformed season collection'); seasons = []; }
  const ordered = [...matches].sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0));
  const expectedMatches = countersValid ? health.matches - baseline.matches : 0;
  if (ordered.length !== expectedMatches) fail('Completed match coverage is incomplete');
  for (let i = 0; i < ordered.length; i++) if (ordered[i]?.id !== baseline?.matches + i + 1) fail('Missing, duplicate or unexpected completed match identifier');
  const activeCount = countersValid && health.matchId > health.matches ? health.playedThisMatch : 0;
  if (activeCount) {
    if (partialMatch?.id !== health.matchId || !Array.isArray(partialMatch?.plays) || partialMatch.plays.length < activeCount) fail('Active match play coverage is incomplete');
    else ordered.push({ ...partialMatch, completedAt: null, plays: partialMatch.plays.slice(0, activeCount) });
  }
  const allPlays = [], identifiers = new Set();
  for (const match of ordered) {
    if (!match || !Array.isArray(match.plays)) { fail('Malformed match record'); continue; }
    const completed = match.completedAt !== null;
    if (match.model !== protocol.model || !integer(match.seasonId) || match.seasonId < 1 || ![1, 2, 3].includes(match.seasonRound) || ![1, 2, 3, 4, 5].includes(match.seasonHand)) fail('Invalid archived game or season identity: ' + match.id);
    if (!seat(match.landlord) || ![1, 2, 3].includes(match.bid) || !Number.isFinite(match.startedAt)) fail('Invalid landlord assignment: ' + match.id);
    if (!Array.isArray(match.bids) || !match.bids.length || match.bids.length > 5) fail('Invalid bid sequence: ' + match.id);
    let bids = Array.isArray(match.bids) ? match.bids : [];
    if (!bids.every(b => b && seat(b.seat) && integer(b.bid) && b.bid <= 3 && Number.isFinite(b.at))) { fail('Malformed bid: ' + match.id); bids = []; }
    if (bids.length) {
      if (Math.max(...bids.map(b => b.bid)) !== match.bid || bids.find(b => b.bid === match.bid)?.seat !== match.landlord) fail('Landlord disagrees with recorded bids: ' + match.id);
      if (bids[0].at > started) gap({ type: 'deal-to-bid', match: match.id }, bids[0].at - match.startedAt, 9000 + (match.redeals || 0) * 21000);
      for (let i = 1; i < bids.length; i++) if (bids[i].at > started) gap({ type: 'between-bids', match: match.id }, bids[i].at - bids[i - 1].at, 3000);
      if (match.plays[0]?.at > started) gap({ type: 'bid-to-play', match: match.id }, match.plays[0].at - bids.at(-1).at, 3000);
    }
    const spent = new Set(), counts = [0, 0, 0, 0, 0];
    let table = null, tableSeat = null, turn = match.landlord, passes = 0, bombs = 0;
    for (let i = 0; i < match.plays.length; i++) {
      const p = match.plays[i];
      if (!p || p.id !== `${match.id}-${i + 1}` || p.number !== i + 1 || p.matchId !== match.id || p.model !== protocol.model || identifiers.has(p.id)) { fail('Invalid or duplicate play identifier in match ' + match.id); continue; }
      identifiers.add(p.id); allPlays.push(p);
      if (!seat(p.seat) || p.seat !== turn || !Array.isArray(p.cards) || typeof p.pass !== 'boolean') { fail('Invalid card turn: ' + p.id); continue; }
      if (!Number.isFinite(p.at) || p.at > now + toleranceMs || p.at <= match.startedAt) fail('Invalid play timestamp: ' + p.id);
      if (i && p.at > started) {
        const previous = match.plays[i - 1];
        gap({ type: 'between-plays', from: previous.id, to: p.id }, p.at - previous.at, previous.pattern?.bomb || previous.pattern?.rocket ? protocol.bombMs : protocol.playMs);
      }
      if (p.pass) {
        if (!table || p.cards.length || p.pattern !== null) fail('Illegal pass: ' + p.id);
        if (++passes === 4) { turn = tableSeat; table = null; tableSeat = null; passes = 0; }
        else turn = (p.seat + 1) % 5;
      } else {
        if (p.cards.some(card => !integer(card) || card > 107)) { fail('Invalid physical card: ' + p.id); continue; }
        const pattern = classifyMove(p.cards);
        if (!pattern || !beats(pattern, table) || JSON.stringify(pattern) !== JSON.stringify(p.pattern)) fail('Illegal card pattern or response: ' + p.id);
        for (const card of p.cards) {
          if (!integer(card) || card > 107 || spent.has(card)) fail('Duplicate or invalid physical card: ' + p.id);
          spent.add(card);
        }
        counts[p.seat] += p.cards.length;
        if (counts[p.seat] > (p.seat === match.landlord ? 28 : 20)) fail('Player spent more than its dealt card count: ' + p.id);
        table = pattern; tableSeat = p.seat; passes = 0; turn = (p.seat + 1) % 5;
        if (pattern?.bomb || pattern?.rocket) bombs++;
      }
    }
    if (completed) {
      if (!seat(match.winner) || match.plays.at(-1)?.seat !== match.winner || match.plays.at(-1)?.pass || counts[match.winner] !== (match.winner === match.landlord ? 28 : 20) || match.completedAt !== match.plays.at(-1)?.at) fail('Winner did not empty its hand at the recorded finish: ' + match.id);
      const landlordTeam = [match.landlord, match.partner].filter(s => s !== null);
      if (match.partner !== null && (!seat(match.partner) || match.partner === match.landlord)) fail('Invalid disclosed partner: ' + match.id);
      const landlordWon = landlordTeam.includes(match.winner);
      const winningSeats = [0, 1, 2, 3, 4].filter(s => landlordTeam.includes(s) === landlordWon);
      if (JSON.stringify(winningSeats) !== JSON.stringify(match.winningSeats) || match.winningTeam !== (landlordWon ? 'landlord' : 'farmers')) fail('Winning team disagrees with winner: ' + match.id);
      if (match.bombs !== bombs || match.multiplier !== Math.min(16, 2 ** Math.min(4, bombs)) || match.baseUnit !== 200 * match.bid * match.multiplier) fail('Invalid settlement multiplier: ' + match.id);
      if (!five(match.pointsDelta) || !match.pointsDelta.every(Number.isSafeInteger) || match.pointsDelta.reduce((a, b) => a + b, 0) !== 0 || !five(match.balancesAfter) || !match.balancesAfter.every(integer)) fail('Invalid or non-conserving bean settlement: ' + match.id);
      const transfers = Array.isArray(match.transfers) ? match.transfers : [], delta = [0, 0, 0, 0, 0];
      for (const t of transfers) {
        if (!seat(t.from) || !seat(t.to) || winningSeats.includes(t.from) || !winningSeats.includes(t.to) || !integer(t.amount) || t.amount > match.baseUnit) { fail('Invalid transfer: ' + match.id); continue; }
        delta[t.from] -= t.amount; delta[t.to] += t.amount;
      }
      if (JSON.stringify(delta) !== JSON.stringify(match.pointsDelta)) fail('Transfers disagree with settlement: ' + match.id);
    }
  }
  for (let i = 1; i < ordered.length; i++) {
    const previous = ordered[i - 1], current = ordered[i];
    if (!Number.isFinite(previous?.completedAt) || !Number.isFinite(current?.startedAt)) continue;
    let min, max;
    if (current.seasonId === previous.seasonId && current.seasonRound === previous.seasonRound && current.seasonHand === previous.seasonHand + 1) { min = 12000; max = 22000; }
    else if (current.seasonId === previous.seasonId && current.seasonRound === previous.seasonRound + 1 && current.seasonHand === 1) { min = 24000; max = 34000; }
    else if (current.seasonId === previous.seasonId + 1 && previous.seasonRound === 3 && current.seasonRound === 1 && current.seasonHand === 1) { min = 39000; max = 39000; }
    else { fail('Adjacent match season sequence is inconsistent: ' + current.id); continue; }
    if (current.startedAt > started) {
      const duration = current.startedAt - previous.completedAt;
      if (duration < min - toleranceMs) fail('Next match started before settlement ended: ' + current.id);
      if (duration > max + toleranceMs) gaps.push({ type: 'between-matches', from: previous.id, to: current.id, extraMs: duration - max });
    }
  }
  const baselineActive = countersValid && baseline.matchId > baseline.matches ? baseline.playedThisMatch : 0;
  if (countersValid && allPlays.length !== health.plays - baseline.plays + baselineActive) fail('Recorded card plays do not cover the counter progression');
  if (elapsedMs >= 86400000 && !allPlays.some(p => p.at > started)) fail('No stored play timestamps demonstrate progress after baseline');

  const orderedSeasons = [...seasons].sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0));
  if (countersValid && orderedSeasons.length !== health.seasons - baseline.seasons) fail('Completed season coverage is incomplete');
  for (let i = 0; i < orderedSeasons.length; i++) {
    const s = orderedSeasons[i];
    if (!s || s.id !== baseline?.seasons + i + 1 || s.model !== protocol.model || !Array.isArray(s.rounds) || s.rounds.length !== 3 || !seat(s.champion) || !five(s.standings) || s.standings[0]?.seat !== s.champion) { fail('Invalid archived season: ' + s?.id); continue; }
    let completedAt = s.startedAt;
    const scores = [0, 0, 0, 0, 0];
    for (let r = 0; r < 3; r++) {
      const round = s.rounds[r];
      if (round?.id !== `${s.id}-${r + 1}` || round?.seasonId !== s.id || round?.round !== r + 1 || ![1, 2, 3, 4, 5].includes(round?.hands) || !['five-hands', 'three-empty-balances', 'repeat-insolvency'].includes(round?.reason) || !Number.isFinite(round?.completedAt) || round.completedAt <= completedAt) fail('Invalid season round summary: ' + s.id);
      completedAt = round?.completedAt;
      if (!['balances', 'debts', 'principal', 'interest', 'netAssets', 'awards', 'cumulativeScores'].every(k => five(round?.[k]))) { fail('Malformed season accounting: ' + s.id); continue; }
      const orderedAssets = [...round.netAssets].sort((a, b) => b - a);
      for (let seat = 0; seat < 5; seat++) {
        scores[seat] += round.awards[seat];
        if (round.interest[seat] !== Math.ceil(round.principal[seat] / 10) || round.netAssets[seat] !== round.balances[seat] - round.debts[seat] || round.awards[seat] !== [10, 6, 3, 1, 0][orderedAssets.indexOf(round.netAssets[seat])] || round.cumulativeScores[seat] !== scores[seat]) fail('Incorrect interest, assets or round points: ' + s.id);
      }
    }
    if (JSON.stringify(scores) !== JSON.stringify(s.scores) || s.completedAt < completedAt || s.completedAt > now + toleranceMs) fail('Season total or finish timestamp disagrees with rounds: ' + s.id);
    if (!s.standings.every(r => r && seat(r.seat) && ['score', 'netWon', 'wins'].every(k => Number.isFinite(r[k])))) { fail('Malformed season standings: ' + s.id); continue; }
    const ranking = [...s.standings].sort((a, b) => b.score - a.score || b.netWon - a.netWon || b.wins - a.wins || a.seat - b.seat);
    if (new Set(s.standings.map(r => r.seat)).size !== 5 || s.standings.some((r, n) => !seat(r.seat) || r.rank !== n + 1 || r.seat !== ranking[n].seat || r.score !== scores[r.seat])) fail('Season champion ranking is inconsistent: ' + s.id);
  }
  const uniqueFailures = [...new Set(failures)];
  return { checkedAt: Number.isFinite(now) ? new Date(now).toISOString() : null, status: uniqueFailures.length || gaps.length ? 'needs-attention' : elapsedMs >= 86400000 ? 'passed' : 'in-progress',
    elapsedHours: elapsedMs / 3600000, requiredHours: protocol.targetHours, model: protocol.model, namespace: protocol.namespace,
    baseline, health, completedMatchesChecked: matches.length, cardPlaysChecked: allPlays.length, completedSeasonsChecked: seasons.length,
    failures: uniqueFailures, timingGaps: gaps, limitation };
}

async function getJSON(path) {
  const response = await fetch(base + path, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}
async function writeJSON(path, data, options = {}) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(data, null, 2) + '\n', options);
}
export async function main(args = process.argv.slice(2)) {
  const health = await getJSON('/api/health');
  const healthObservedAt = Date.now();
  if (health.model !== protocol.model || health.namespace !== protocol.namespace) throw new Error('The public site is not running the five-player model; no baseline was changed.');
  if (args.includes('--start')) {
    const baseline = { ...health, checkedAt: new Date(healthObservedAt).toISOString() };
    const partialMatch = health.matchId > health.matches && health.playedThisMatch ? (await getJSON(`/api/matches/${health.matchId}`)).match : null;
    const check = evaluateAudit({ baseline, health, partialMatch, now: healthObservedAt });
    if (check.status === 'needs-attention') throw new Error('Cannot start an invalid baseline: ' + check.failures.join('; '));
    await writeJSON(baselinePath, baseline, { flag: 'wx' });
    console.log(JSON.stringify({ status: 'baseline-created', path: baselinePath, limitation }));
    return;
  }
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  const matches = [], seasons = [], fetchFailures = [];
  const retrieve = async (kind, first, last, destination, retained) => {
    if (!integer(first) || !integer(last) || last - first + 1 > retained) { fetchFailures.push(`${kind} audit window exceeds retained records or has invalid counters`); return; }
    for (let offset = first; offset <= last; offset += 8) {
      await Promise.all(Array.from({ length: Math.min(8, last - offset + 1) }, async (_, j) => {
        const id = offset + j;
        try { destination.push((await getJSON(`/api/${kind}/${id}`))[kind === 'matches' ? 'match' : 'season']); }
        catch (e) { fetchFailures.push(e.message); }
      }));
    }
  };
  await Promise.all([
    retrieve('matches', baseline.matches + 1, health.matches, matches, 1001),
    retrieve('seasons', baseline.seasons + 1, health.seasons, seasons, 100),
  ]);
  let partialMatch = null;
  if (health.matchId > health.matches && health.playedThisMatch) {
    try { partialMatch = (await getJSON(`/api/matches/${health.matchId}`)).match; }
    catch (e) { fetchFailures.push(e.message); }
  }
  // Compare the frozen health snapshot to its own receipt time. Archive downloads
  // may take longer than one card turn and must not create a false overdue alarm.
  const result = evaluateAudit({ baseline, health, matches, partialMatch, seasons, fetchFailures, now: healthObservedAt });
  await writeJSON(reportPath, result);
  console.log(JSON.stringify({ status: result.status, elapsedHours: result.elapsedHours, matches: result.completedMatchesChecked, plays: result.cardPlaysChecked, seasons: result.completedSeasonsChecked, failures: result.failures, timingGaps: result.timingGaps.length, report: reportPath, limitation }));
  if (result.status === 'needs-attention') process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
