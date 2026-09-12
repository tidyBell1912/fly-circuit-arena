import { readFile, writeFile, mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { BASE_STAKE, GAME_MODEL } from '../src/doudizhu-arena.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const seeds = [1, 2, 3, 4, 5], stakes = [10, 100, 200];
const sum = a => a.reduce((x, y) => x + y, 0);
const directory = await mkdtemp(join(tmpdir(), 'fly-ddz-economy-'));
const source = await readFile(join(root, 'src/doudizhu-arena.js'), 'utf8');
const report = {
  generatedAt: new Date().toISOString(), model: GAME_MODEL.version, graphHash: GAME_MODEL.graphHash,
  sourceHashes: {}, selectedBaseStake: BASE_STAKE, pairedSeeds: seeds,
  selectionRationale: 'Base stake 200 selected from the unpublished parameter comparison: borrowing occurs naturally in all five sampled seasons, with occasional repeated-insolvency round endings and no sampled three-player simultaneous insolvency. This is a small engineering calibration, not a guarantee for any future season.',
  design: 'Five full natural seasons per base stake. Identical initial seeds, unchanged shuffle and policy. Only BASE_STAKE differs. Real credit pulses may cause later policy trajectories to diverge. No forced card deals, wins, insolvency, loans or round endings.',
  parameters: { initialBalance: 10000, loan: 5000, loanLimitPerPlayerPerRound: 1,
    roundsPerSeason: 3, maxHandsPerRound: 5, interestOnPrincipalPerRound: 0.1,
    baseStakes: stakes, maxBombMultiplier: 16, positiveCreditPulse: 0.2, negativeCreditPulse: -0.35 },
  limitations: ['Small, deterministic engineering calibration; not a population estimate or evidence of learning superiority.',
    'A season ends naturally after three rounds; early round endings can reduce games below fifteen.',
    'Borrowing is automatic virtual-credit continuation, not a learned voluntary borrowing decision.'],
  trials: [],
};
for (const name of ['src/doudizhu-arena.js', 'src/doudizhu-policy.js', 'src/doudizhu-rules.js', 'src/brain.js']) {
  report.sourceHashes[name] = createHash('sha256').update(await readFile(join(root, name))).digest('hex');
}
try {
  for (const stake of stakes) {
    const modulePath = join(directory, `arena-${stake}.mjs`);
    const modified = source.replace(/export const BASE_STAKE = \d+;/, `export const BASE_STAKE = ${stake};`)
      .replace(/from '(\.\/[^']+)'/g, (_, specifier) => `from '${pathToFileURL(resolve(root, 'src', specifier)).href}'`);
    await writeFile(modulePath, modified);
    const { createArena, advanceArena } = await import(pathToFileURL(modulePath).href);
    const seasons = [];
    for (const seed of seeds) {
      const state = createArena(0, seed), hands = [], loans = [], roundSummaries = [];
      const totalBeans = () => 50000 + sum(state.stats.borrowed);
      for (let step = 0; step < 20000 && state.stats.seasons === 0; step++) {
        const oldPhase = state.phase;
        const event = advanceArena(state, state.deadline);
        assert.equal(sum(state.balances), totalBeans());
        assert.ok(state.balances.every(b => b >= 0 && Number.isInteger(b)));
        if (state.phase === 'loanPositive' && oldPhase !== 'loanPositive') {
          loans.push({ at: state.phaseStart, round: state.season.round, hand: state.season.hand,
            borrowers: [...state.credit.borrowers], amounts: state.credit.borrowers.map(() => 5000),
            balances: [...state.balances], debts: [...state.debts],
            actualPredictionErrors: state.credit.borrowers.map(i => state.feedback[i].delta),
            changedWeightUpdates: state.credit.borrowers.map(i => state.feedback[i].changedEdges) });
        }
        if (event.match) {
          assert.equal(sum(event.match.pointsDelta), 0);
          hands.push({ id: event.match.id, round: state.season.round, hand: state.season.hand,
            seconds: (event.match.completedAt - event.match.startedAt) / 1000,
            turns: event.match.plays.length, bid: event.match.bid, bombs: event.match.bombs,
            multiplier: event.match.multiplier, unit: event.match.baseUnit,
            winningSeats: event.match.winningSeats, delta: event.match.pointsDelta,
            balances: event.match.balancesAfter, emptySeats: state.balances.flatMap((b, i) => b === 0 ? [i] : []) });
        }
        if (event.roundSummary) roundSummaries.push(event.roundSummary);
      }
      assert.equal(state.stats.seasons, 1, 'Season must terminate without a fabricated winner');
      assert.equal(roundSummaries.length, 3);
      seasons.push({ seed, games: hands.length, simulatedMinutes: state.phaseStart / 60000,
        loanStages: loans.length, individualLoans: loans.reduce((n, x) => n + x.borrowers.length, 0),
        borrowers: state.stats.borrowed.map(v => v / 5000), borrowedBeans: state.stats.borrowed,
        finalBalances: [...state.balances], finalDebts: [...state.debts], finalPrincipal: [...state.principal],
        interest: state.stats.interest, champion: state.season.champion,
        insolvencyHands: hands.filter(h => h.emptySeats.length).length,
        threeEmptyHands: hands.filter(h => h.emptySeats.length >= 3).length,
        earlyRounds: roundSummaries.filter(r => r.reason !== 'five-hands').length,
        hands, loans, rounds: roundSummaries });
    }
    const summary = { baseStake: stake, seasons: seasons.length, games: sum(seasons.map(s => s.games)),
      loanStages: sum(seasons.map(s => s.loanStages)), individualLoans: sum(seasons.map(s => s.individualLoans)),
      seasonsWithLoans: seasons.filter(s => s.individualLoans > 0).length,
      insolvencyHands: sum(seasons.map(s => s.insolvencyHands)),
      threeEmptyHands: sum(seasons.map(s => s.threeEmptyHands)),
      earlyRounds: sum(seasons.map(s => s.earlyRounds)),
      totalRounds: seasons.length * 3, meanFinalDebts: Array.from({ length: 5 }, (_, i) => sum(seasons.map(s => s.finalDebts[i])) / seeds.length) };
    report.trials.push({ summary, seasons });
    console.log(JSON.stringify(summary));
  }
  await mkdir(join(root, 'artifacts/validation'), { recursive: true });
  await writeFile(join(root, 'artifacts/validation/doudizhu-economy.json'), JSON.stringify(report, null, 2) + '\n');
} finally { await rm(directory, { recursive: true, force: true }); }
