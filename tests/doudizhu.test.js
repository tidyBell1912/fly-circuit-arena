import test from 'node:test';
import assert from 'node:assert/strict';
import { createArena, advanceArena, publicArena, getPolicyView, settleTransfers, roundEndReason, GAME_MODEL, BASE_STAKE } from '../src/doudizhu-arena.js';
import { rankOf, cardDeck, cardSuit, classifyMove, beats, legalMoves, shuffleDeck } from '../src/doudizhu-rules.js';
import { choosePlay, createBrain, publicDecision } from '../src/doudizhu-policy.js';

const next = s => advanceArena(s, s.deadline);
const rankCards = (rank, count) => rank > 15 ? (rank === 16 ? [52, 106] : [53, 107]).slice(0, count)
  : Array.from({ length: count }, (_, i) => (rank - 3) * 4 + i % 4 + Math.floor(i / 4) * 54);
const cards = groups => groups.flatMap(([rank, count]) => rankCards(rank, count));
const chain = (start, length, count) => Array.from({ length }, (_, i) => [start + i, count]);
const sum = a => a.reduce((x, y) => x + y, 0);

function conservation(s) {
  const visiblePlayed = s.match.plays.flatMap(p => p.cards);
  const all = [...s.hands.flat(), ...visiblePlayed, ...(s.bottomAssigned ? [] : s.bottom)];
  assert.equal(all.length, 108);
  assert.equal(new Set(all).size, 108);
  assert.deepEqual([...all].sort((a, b) => a - b), Array.from({ length: 108 }, (_, i) => i));
}
function finishOne(s, maxSteps = 2000) {
  const target = s.stats.matches + 1;
  for (let step = 0; step < maxSteps; step++) {
    const beforePhase = s.phase, beforeTable = s.tableMove, beforeSeat = s.turn,
      beforeHand = [...s.hands[beforeSeat]], beforePass = s.passCount, beforeTableSeat = s.tableSeat;
    const e = next(s);
    conservation(s);
    if (e.round) {
      const play = e.round;
      assert.equal(beforePhase, 'play'); assert.equal(play.seat, beforeSeat);
      if (play.pass) {
        assert.ok(beforeTable);
        assert.equal(play.cards.length, 0);
        if (beforePass === 3) { assert.equal(s.tableMove, null); assert.equal(s.turn, beforeTableSeat); }
      } else {
        const pattern = classifyMove(play.cards);
        assert.deepEqual(play.pattern, pattern); assert.ok(beats(pattern, beforeTable));
        assert.ok(play.cards.every(c => beforeHand.includes(c)));
        assert.equal(new Set(play.cards).size, play.cards.length);
      }
    }
    if (s.stats.matches === target) return e;
  }
  throw new Error('A game did not end within the test guard; no artificial winner was assigned');
}

test('108 unique cards, two decks, fourteen patterns and declared special rules', () => {
  const deck = shuffleDeck(123);
  assert.equal(deck.length, 108); assert.equal(new Set(deck).size, 108);
  assert.equal(cardDeck(53), 0); assert.equal(cardDeck(54), 1);
  assert.equal(rankOf(52), 16); assert.equal(rankOf(106), 16); assert.equal(rankOf(107), 17);
  assert.equal(cardSuit(52), null); assert.equal(cardSuit(0), cardSuit(54));
  const examples = [
    ['single', [[3, 1]]], ['pair', [[4, 2]]], ['triple', [[5, 3]]],
    ['triple-single', [[6, 3], [7, 1]]], ['triple-pair', [[6, 3], [7, 2]]],
    ['straight', chain(3, 5, 1)], ['pair-straight', chain(3, 3, 2)],
    ['airplane', chain(3, 2, 3)], ['airplane-single', [[3, 3], [4, 3], [6, 2]]],
    ['airplane-pair', [[3, 3], [4, 3], [6, 2], [7, 2]]],
    ['four-two-single', [[3, 4], [7, 2]]], ['four-two-pair', [[3, 4], [7, 2], [8, 2]]],
    ['bomb', [[3, 8]]], ['rocket', [[16, 2], [17, 2]]],
  ];
  for (const [type, groups] of examples) assert.equal(classifyMove(cards(groups))?.type, type);
  assert.equal(classifyMove([52, 53]), null);
  assert.equal(classifyMove([52, 106]).type, 'pair');
  assert.equal(classifyMove(cards(chain(11, 5, 1))), null);
  assert.equal(classifyMove(cards([[3, 4], [16, 1], [17, 1]])), null);
  assert.equal(classifyMove(cards([[3, 3], [4, 3], [16, 1], [17, 1]])), null);
  assert.equal(classifyMove(cards([[3, 4], [4, 3], [7, 1]])), null);
  assert.equal(classifyMove(cards(chain(3, 4, 3))).type, 'airplane');
  assert.equal(classifyMove([0, 0]), null);
  assert.ok(beats(classifyMove(rankCards(3, 5)), classifyMove(rankCards(15, 4))));
  assert.ok(beats(classifyMove([52, 53, 106, 107]), classifyMove(rankCards(15, 8))));
  assert.equal(beats(classifyMove(rankCards(15, 8)), classifyMove([52, 53, 106, 107])), false);
});

test('candidate generator offers only owned, classified, beating moves', () => {
  let evaluated = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const hand = shuffleDeck(seed).slice(0, seed % 2 ? 20 : 28);
    const lead = legalMoves(hand);
    assert.ok(lead.length > 0 && lead.length <= 2000);
    const table = lead[Math.floor(lead.length / 2)].pattern;
    for (const [moves, target] of [[lead, null], [legalMoves(hand, table), table]]) {
      for (const move of moves) {
        assert.ok(move.cards.every(c => hand.includes(c)));
        assert.deepEqual(classifyMove(move.cards), move.pattern);
        assert.ok(beats(move.pattern, target)); evaluated++;
      }
    }
  }
  assert.ok(evaluated > 10000);
});

test('100 independent complete games remain legal, conserve cards and settle finite zero-sum beans', () => {
  const seconds = [], turns = [];
  for (let seed = 1; seed <= 100; seed++) {
    const s = createArena(0, seed);
    assert.equal(s.brains.length, 5); assert.deepEqual(s.hands.map(h => h.length), [20, 20, 20, 20, 20]);
    const event = finishOne(s);
    assert.equal(s.phase, 'settle'); assert.equal(s.stats.matches, 1);
    assert.ok(s.match.plays.length <= 540);
    assert.equal(s.hands[s.match.winner].length, 0);
    assert.ok(event.match.winningSeats.includes(s.match.winner));
    assert.equal(sum(s.match.pointsDelta), 0); assert.equal(sum(s.balances), 50000);
    assert.ok(s.balances.every(b => Number.isInteger(b) && b >= 0));
    assert.equal(s.match.baseUnit, BASE_STAKE * s.match.bid * Math.min(16, 2 ** Math.min(4, s.match.bombs)));
    assert.ok(s.brains.some(b => b.updates > 0));
    seconds.push(s.match.completedAt / 1000); turns.push(s.match.plays.length);
  }
  console.log(JSON.stringify({ doudizhuValidation: { seeds: 100, meanSeconds: sum(seconds) / 100,
    minSeconds: Math.min(...seconds), maxSeconds: Math.max(...seconds), meanTurns: sum(turns) / 100 } }));
});

test('policy whitelist cannot inspect other hands or undeclared identity', () => {
  const s = createArena(0, 71);
  while (s.phase !== 'play') next(s);
  const seat = s.turn;
  const hiddenHands = s.hands.map((hand, i) => i === seat ? hand : new Proxy(hand, {
    get(target, key) {
      if (key === 'length') return target.length;
      throw new Error('Hidden hand access: ' + String(key));
    },
  }));
  const guarded = { ...s, hands: hiddenHands };
  const view = getPolicyView(guarded, seat);
  assert.equal('hands' in view, false);
  assert.equal('privatePartner' in view, false);
  assert.equal(view.revealedPartner, null);
  assert.equal(view.ownRole, 'landlord');
  assert.deepEqual(view.hand, s.hands[seat]);
  const a = choosePlay(createBrain(999), view), b = choosePlay(createBrain(999), structuredClone(view));
  assert.deepEqual(a.move, b.move); assert.deepEqual(a.decision.probability, b.decision.probability);
  const beforeReveal = publicArena(s);
  assert.equal(beforeReveal.partner, null); assert.equal(beforeReveal.match.partner, null);
  assert.equal(beforeReveal.identityCard, null);
  assert.equal(beforeReveal.roles.filter(x => x === 'landlord').length, 1);
  assert.equal(beforeReveal.roles.filter(x => x === 'partner').length, 0);
  const disclosed = publicDecision({ decision: a.decision, candidateIndex: 1,
    candidates: [{ cards: [1, 2], label: 'support-known-ally' }, { cards: [3] }] });
  assert.equal(disclosed.candidateCount, 2); assert.equal(disclosed.candidateIndex, 1);
  assert.equal('candidates' in disclosed, false);
  assert.equal(JSON.stringify(disclosed).includes('support-known-ally'), false);
  next(s);
  const afterAction = publicArena(s);
  assert.equal('candidates' in afterAction.lastAction, false);
  assert.equal('candidates' in afterAction.match.plays.at(-1), false);
});

test('insolvent losers pay independently; integer remainders do not leave unpayable crumbs', () => {
  const balances = [0, 1, 5, 100, 100];
  const { delta, transfers } = settleTransfers(balances, [4, 3], 10);
  const after = balances.map((b, i) => b + delta[i]);
  assert.equal(sum(delta), 0); assert.deepEqual(after.slice(0, 3), [0, 0, 0]);
  assert.ok(after.every(b => b >= 0 && Number.isInteger(b)));
  assert.equal(transfers.find(t => t.from === 1 && t.to === 3).amount, 1);
  const richer = settleTransfers([0, 100, 100, 100, 100], [3, 4], 10);
  assert.equal(richer.delta[1], -20); assert.equal(richer.delta[2], -20);
});

test('automatic loans deliver signed model pulses only to the borrower, once per round', () => {
  const s = createArena(0, 14); finishOne(s);
  s.balances[0] = 0;
  const before = s.brains.map(b => JSON.stringify(b));
  next(s);
  assert.equal(s.phase, 'loanPositive'); assert.equal(s.deadline - s.phaseStart, 4000);
  assert.equal(s.balances[0], 5000); assert.equal(s.debts[0], 5000); assert.equal(s.principal[0], 5000);
  assert.equal(s.loanCounts[0], 1); assert.equal(s.credit.automatic, true);
  assert.equal(s.feedback[0].source, 'credit-positive'); assert.ok(s.feedback[0].delta > 0);
  assert.notEqual(JSON.stringify(s.brains[0]), before[0]);
  for (let i = 1; i < 5; i++) assert.equal(JSON.stringify(s.brains[i]), before[i]);
  const positive = JSON.stringify(s.brains[0]); next(s);
  assert.equal(s.phase, 'loanNegative'); assert.equal(s.deadline - s.phaseStart, 6000);
  assert.equal(s.feedback[0].source, 'credit-negative'); assert.ok(s.feedback[0].delta < 0);
  assert.notEqual(JSON.stringify(s.brains[0]), positive);
  next(s); assert.equal(s.phase, 'deal');
  s.balances[0] = 0; s.phase = 'settle'; s.deadline = 99999;
  assert.equal(roundEndReason(s), 'repeat-insolvency');
  const event = next(s);
  assert.equal(s.phase, 'roundEnd'); assert.equal(event.roundSummary.reason, 'repeat-insolvency');
  assert.equal(s.debts[0], 5500); assert.equal(s.stats.interest[0], 500);
});

test('round triggers, interest before scoring, tied awards and persistent season reset', () => {
  const s = createArena(0, 3);
  s.balances = [0, 0, 0, 10000, 10000];
  assert.equal(roundEndReason(s), 'three-empty-balances');
  s.balances = [10000, 10000, 10000, 10000, 10000];
  s.debts = [5000, 0, 0, 0, 0]; s.principal = [5000, 0, 0, 0, 0];
  s.season.hand = 5; s.phase = 'settle'; s.deadline = 1;
  const round = next(s);
  assert.equal(round.roundSummary.netAssets[0], 4500);
  assert.deepEqual(round.roundSummary.awards, [0, 10, 10, 10, 10]);
  // A final-round tie resolves by the openly specified deterministic seat rule.
  s.season.round = 3; s.season.scores = [10, 10, 10, 10, 10];
  s.season.netWins = [0, 0, 0, 0, 0]; s.season.wins = [0, 0, 0, 0, 0];
  const savedBrains = JSON.stringify(s.brains), oldMatch = s.match.id;
  const season = next(s);
  assert.equal(s.phase, 'seasonEnd'); assert.equal(season.season.champion, 0);
  assert.equal(s.stats.seasons, 1); assert.equal(s.stats.seasonWins[0], 1);
  next(s);
  assert.equal(s.phase, 'deal'); assert.equal(s.season.id, 2); assert.equal(s.match.id, oldMatch + 1);
  assert.deepEqual(s.balances, [10000, 10000, 10000, 10000, 10000]);
  assert.deepEqual(s.debts, [0, 0, 0, 0, 0]); assert.deepEqual(s.season.scores, [0, 0, 0, 0, 0]);
  assert.equal(JSON.stringify(s.brains), savedBrains);
  assert.equal(s.lastSeason.champion, 0);
});

test('season ends within fifteen games and restarts while independent learning survives', () => {
  const s = createArena(0, 2026);
  const initial = s.brains.map(b => JSON.stringify(b.gains));
  for (let i = 0; i < 18000 && s.season.id === 1; i++) next(s);
  assert.equal(s.season.id, 2); assert.equal(s.stats.seasons, 1);
  assert.ok(s.stats.matches > 0 && s.stats.matches <= 15);
  assert.equal(s.lastSeason.rounds.length, 3);
  assert.ok(s.brains.every((b, i) => JSON.stringify(b.gains) !== initial[i] && b.decisions > 0 && b.updates > 0));
  assert.deepEqual(s.balances, [10000, 10000, 10000, 10000, 10000]);
  assert.equal(GAME_MODEL.namespace, 'ddz-five-v1');
  assert.equal(GAME_MODEL.baseStake, BASE_STAKE);
});
