import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const base = 'https://fly-circuit-arena.fly-circuit-arena.workers.dev';
const baselinePath = 'artifacts/validation/soak-start.json';
const reportPath = 'artifacts/validation/soak-report.json';
const toleranceMs = 2500;
const limitation = 'Audit of stored outcomes and observed timestamps; not an external continuous reachability measurement.';
const integer = x => Number.isSafeInteger(x) && x >= 0;

// This protocol describes Sugar Heist. Change it when the game protocol changes.
export const protocol = { roundsPerMatch: 5, roundMs: 30000, betweenMatchesMs: 30000, decisionCompleteMs: 24000 };

export function evaluateAudit({ baseline, health, matches = [], partialMatch = null, fetchFailures = [], now = Date.now() }) {
  const failures = [...fetchFailures], gaps = [];
  const started = Date.parse(baseline?.checkedAt), elapsedMs = now - started;
  const elapsedHours = elapsedMs / 3600000;
  const fail = message => failures.push(message);
  const gap = (scope, extraMs) => { if (extraMs > toleranceMs) gaps.push({ ...scope, extraMs }); };
  const validCounters = value => value && ['rounds', 'matches', 'revision'].every(k => integer(value[k]));
  if (!Number.isFinite(started) || !Number.isFinite(now) || elapsedMs < 0) fail('Invalid audit time window');
  if (!validCounters(baseline) || !Number.isFinite(baseline?.createdAt) || !baseline?.model || !baseline?.ok) fail('Invalid or unhealthy baseline');
  if (!validCounters(health) || !Number.isFinite(health?.createdAt) || !health?.model) fail('Invalid current health response');
  if (!health?.ok) fail('Current arena is unhealthy');
  const countersValid = validCounters(baseline) && validCounters(health);
  if (baseline?.createdAt !== health?.createdAt) fail('Arena identity changed since baseline');
  if (baseline?.model !== health?.model) fail('Model version changed since baseline');
  const firstId = baseline?.baselineMatchId;
  if (!integer(firstId) || firstId !== baseline?.matches + 1) fail('Baseline match identifier is inconsistent');
  if (countersValid) {
    for (const key of ['revision', 'rounds', 'matches']) {
      if (health[key] < baseline[key]) fail('Counter regressed: ' + key);
    }
    for (const [label, value] of [['baseline', baseline], ['current', health]]) {
      const remainder = value.rounds - value.matches * protocol.roundsPerMatch;
      if (remainder < 0 || remainder > protocol.roundsPerMatch) fail('Round and match counts disagree at ' + label);
    }
    if (elapsedMs > 65000 && health.rounds === baseline.rounds) fail('No completed-round progress over the observed window');
    if (elapsedMs > 210000 && health.matches === baseline.matches) fail('No completed-match progress over the observed window');
    if (elapsedMs > 65000 && health.revision === baseline.revision) fail('No state revision progress over the observed window');
  }
  if (!Array.isArray(matches)) { fail('Match records are not an array'); matches = []; }
  const ordered = [...matches].sort((a, b) => (a?.id ?? 0) - (b?.id ?? 0));
  const expectedCount = countersValid ? Math.max(0, health.matches - baseline.matches) : 0;
  if (ordered.length !== expectedCount) fail('Completed-match coverage is incomplete');
  const rounds = [], seen = new Set();
  for (let i = 0; i < ordered.length; i++) {
    const match = ordered[i];
    if (!match || match.id !== firstId + i) fail('Missing, duplicate or unexpected match identifier');
    const list = Array.isArray(match?.rounds) ? match.rounds : [];
    const score = [0, 0];
    if (list.length !== protocol.roundsPerMatch) fail('Invalid five-round match ' + match?.id);
    for (let j = 0; j < list.length; j++) {
      const round = list[j];
      if (round?.number !== j + 1 || round?.matchId !== match.id || round?.id !== `${match.id}-${j + 1}`) fail('Round sequence mismatch in match ' + match.id);
      if (round?.winner === 0 || round?.winner === 1) score[round.winner]++;
    }
    if (!Array.isArray(match?.score) || match.score.length !== 2 || match.score[0] !== score[0] || match.score[1] !== score[1] || score[0] === score[1] || match.winner !== (score[0] > score[1] ? 0 : 1)) fail('Match score or winner disagrees with rounds: ' + match?.id);
    rounds.push(...list);
  }
  const remainder = countersValid ? health.rounds - health.matches * protocol.roundsPerMatch : 0;
  if (remainder > 0) {
    if (partialMatch?.id !== health.matches + 1 || !Array.isArray(partialMatch?.rounds) || partialMatch.rounds.length < remainder) fail('Current completed-round coverage is incomplete');
    else {
      for (let i = 0; i < remainder; i++) {
        const r = partialMatch.rounds[i];
        if (r?.number !== i + 1 || r?.matchId !== partialMatch.id || r?.id !== `${partialMatch.id}-${i + 1}`) fail('Current round sequence mismatch');
        rounds.push(r);
      }
    }
  }
  const coveredRounds = rounds.filter(r => r && typeof r === 'object');
  if (coveredRounds.length !== rounds.length) fail('Malformed round record');
  for (const r of coveredRounds) {
    if (seen.has(r.id)) fail('Duplicate round ' + r.id);
    seen.add(r.id);
    const times = [r.startedAt, r.predictionLockedAt, r.choicesLockedAt, r.revealedAt, r.completedAt];
    if (!times.every(Number.isFinite) || !times.every((t, i) => i === 0 || t > times[i - 1]) || r.completedAt > now + toleranceMs) fail('Invalid decision ordering ' + r.id);
    if (r.model !== baseline?.model) fail('Round model differs from baseline: ' + r.id);
    const validActions = Array.isArray(r.actions) && r.actions.length === 2 && r.actions.every(x => x === 0 || x === 1);
    if (!validActions || ![0, 1].includes(r.hunter) || r.winner !== (r.actions[0] === r.actions[1] ? r.hunter : 1 - r.hunter)) fail('Wrong winner or invalid choices ' + r.id);
    if (![0, 1].includes(r.prediction) || r.correct !== (r.prediction === r.winner)) fail('Incorrect prediction settlement ' + r.id);
    if (r.completedAt > started) gap({ type: 'within-round', round: r.id }, r.completedAt - r.startedAt - protocol.decisionCompleteMs);
  }
  // Comparing adjacent starts covers delays in feedback, recap and introductions too.
  for (let i = 1; i < coveredRounds.length; i++) {
    const previous = coveredRounds[i - 1], current = coveredRounds[i];
    const sameMatch = previous.matchId === current.matchId;
    const expected = protocol.roundMs + (sameMatch ? 0 : protocol.betweenMatchesMs);
    if (current.startedAt <= previous.startedAt) fail('Non-increasing round timestamps ' + current.id);
    if (current.startedAt > started) gap({ type: 'between-rounds', from: previous.id, to: current.id }, current.startedAt - previous.startedAt - expected);
  }
  const last = coveredRounds.at(-1);
  if (last) {
    const expected = protocol.roundMs + (last.number === protocol.roundsPerMatch ? protocol.betweenMatchesMs : 0);
    gap({ type: 'unfinished-tail', after: last.id }, now - last.completedAt - expected);
  } else if (elapsedMs > 65000) fail('No recorded outcomes cover the audit window');
  if (countersValid) {
    const expectedRecords = expectedCount * protocol.roundsPerMatch + Math.max(0, remainder);
    if (seen.size !== expectedRecords) fail('Round record coverage disagrees with health counters');
    // Allow boundary effects and ordinary distributed scheduling overhead, but not sparse progress.
    const minimumRounds = Math.max(0, Math.floor((elapsedMs - 60000) / 40000));
    if (health.rounds - baseline.rounds < minimumRounds) fail('Round count progression is too slow for the observed window');
    if (elapsedHours >= 24 && ['revision', 'rounds', 'matches'].some(k => health[k] <= baseline[k])) fail('A 24-hour pass requires progress in every counter');
  }
  const status = failures.length || gaps.length ? 'needs-attention' : elapsedHours < 24 ? 'in-progress' : 'passed';
  return { checkedAt: Number.isFinite(new Date(now).getTime()) ? new Date(now).toISOString() : null, baseline, health, elapsedHours, checkedMatches: ordered.length, checkedRounds: coveredRounds.length, observedRoundProgress: countersValid ? health.rounds - baseline.rounds : null, failures: [...new Set(failures)], schedulingGaps: gaps, status, limitation };
}

async function fetchJson(path) {
  const response = await fetch(base + path, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${path}`);
  return response.json();
}

export async function main(args = process.argv.slice(2)) {
  await mkdir('artifacts/validation', { recursive: true });
  if (args.includes('--start')) {
    const health = await fetchJson('/api/health');
    if (!health.ok || !integer(health.matches)) throw new Error('Cannot start with an unhealthy baseline');
    await writeFile(baselinePath, JSON.stringify({ ...health, checkedAt: new Date().toISOString(), baselineMatchId: health.matches + 1 }, null, 2) + '\n');
    console.log('Saved an actual live baseline.');
    return;
  }
  const baseline = JSON.parse(await readFile(baselinePath, 'utf8'));
  let health = null;
  const matches = [], fetchFailures = [];
  try { health = await fetchJson('/api/health'); } catch (e) { fetchFailures.push('Health request failed: ' + e.message); }
  const observedAt = Date.now();
  let partialMatch = null;
  if (integer(health?.matches) && integer(baseline.baselineMatchId)) {
    const count = Math.max(0, health.matches - baseline.baselineMatchId + 1);
    if (count > 1001) fetchFailures.push('Audit window exceeds retained detailed matches');
    const ids = Array.from({ length: Math.min(count, 1001) }, (_, i) => baseline.baselineMatchId + i);
    for (let i = 0; i < ids.length; i += 8) await Promise.all(ids.slice(i, i + 8).map(async id => {
      try { matches.push((await fetchJson('/api/matches/' + id)).match); }
      catch (e) { fetchFailures.push('Missing match ' + id + ': ' + e.message); }
    }));
    if (health.rounds > health.matches * protocol.roundsPerMatch) {
      try { partialMatch = (await fetchJson('/api/matches/' + (health.matches + 1))).match; }
      catch (e) { fetchFailures.push('Current match could not be inspected: ' + e.message); }
    }
  }
  const report = evaluateAudit({ baseline, health, matches, partialMatch, fetchFailures, now: observedAt });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ status: report.status, elapsedHours: report.elapsedHours, checkedMatches: report.checkedMatches, checkedRounds: report.checkedRounds, failures: report.failures, gaps: report.schedulingGaps.length }));
  if (report.status === 'needs-attention') process.exitCode = 1;
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
