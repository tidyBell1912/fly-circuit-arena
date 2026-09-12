import { createBrain, decideBrain, reinforceBrain, random, MODEL as BRAIN_MODEL } from './brain.js';
import { rankOf, legalMoves, classifyMove } from './doudizhu-rules.js';

export { createBrain };
export const CREDIT_WINDOW = 8;

const clamp = x => Math.max(0, Math.min(1, x));
const mean = a => a.reduce((s, x) => s + x, 0) / Math.max(1, a.length);
const ranksOf = hand => {
  const groups = new Map();
  for (const card of hand) { const rank = rankOf(card); groups.set(rank, (groups.get(rank) || 0) + 1); }
  return groups;
};

// Only the explicitly constructed information-set view enters this module.
// It contains this player's cards, public counts/history, and their own identity knowledge.
export function encodeView(view, kind = 'play') {
  const ranks = ranksOf(view.hand);
  const high = view.hand.filter(c => rankOf(c) >= 14).length;
  const grouped = [...ranks.values()].reduce((s, c) => s + (c >= 2 ? c : 0), 0);
  const threat = Math.min(...view.handCounts.filter((_, s) => s !== view.seat));
  return [
    1,
    clamp(view.hand.length / 28),
    view.ownRole === 'landlord' ? 1 : view.ownRole === 'partner' ? 0.6 : 0,
    clamp(high / Math.max(1, view.hand.length)),
    clamp(grouped / Math.max(1, view.hand.length)),
    kind === 'bid' ? clamp(view.highestBid / 3) : clamp((view.tableMove?.mainRank || 3) / 17),
    clamp(threat / 28),
    kind === 'bid' ? 0 : clamp((view.publicPlays || []).slice(-5).filter(p => p.pass).length / 5),
  ];
}

function neural(brain, cue) {
  try { return decideBrain(brain, { cue }, { recordNeurons: true }); }
  catch (error) {
    if (error.message !== 'No Kenyon activity for this stimulus') throw error;
    // A genuinely silent episode has no eligibility. The neutral fallback is explicit,
    // consumes one draw, and never pretends that output spikes were observed.
    const action = random(brain) < 0.5 ? 0 : 1;
    brain.decisions++;
    return { action, probability: [0.5, 0.5], features: Array(BRAIN_MODEL.kc).fill(0),
      trace: { PN: [], KC: [], MBON07: [], MBON11: [], APL: [], hotIds: [] },
      activeKCs: 0, simulatedMs: 160, silent: true, neural: error.neural || null };
  }
}

function chosen(brain, view, candidates, kind) {
  if (!candidates.length) throw new Error('No legal candidates');
  const decision = neural(brain, encodeView(view, kind));
  const forced = candidates.length === 1;
  const index = forced ? 0 : decision.action;
  return { move: candidates[index], decision, forced, candidateIndex: index,
    candidates: candidates.map(c => ({ cards: c.cards || [], pattern: c.pattern || null,
      pass: !!c.pass, bid: c.bid, label: c.label })) };
}

export function chooseBid(brain, view) {
  const groups = ranksOf(view.hand);
  let strength = view.hand.filter(c => rankOf(c) >= 15).length * 1.4;
  strength += [...groups.entries()].reduce((s, [r, count]) => s + (r <= 15 && count >= 4 ? (count - 3) * 2 : 0), 0);
  const suggested = strength >= 10 ? 3 : strength >= 5 ? 2 : 1;
  const bid = Math.min(3, Math.max(view.highestBid + 1, suggested));
  return chosen(brain, view, [
    { bid: 0, label: 'decline', cards: [] },
    { bid, label: 'raise', cards: [] },
  ], 'bid');
}

export function chooseIdentity(brain, view) {
  const copies = new Map();
  for (const card of view.hand) { const face = card % 54; copies.set(face, (copies.get(face) || 0) + 1); }
  const candidates = [...copies].filter(([face, count]) => face < 52 && count === 1)
    .map(([face]) => face).sort((a, b) => rankOf(a) - rankOf(b) || a - b);
  if (!candidates.length) return { token: null, decision: null, forced: true, candidates: [] };
  const selections = [candidates[0], candidates.at(-1)].filter((x, i, a) => a.indexOf(x) === i);
  const result = chosen(brain, view, selections.map(token => ({ token, cards: [], label: token === selections[0] ? 'low-identity' : 'high-identity' })), 'identity');
  return { ...result, token: result.move.token };
}

function remainderPenalty(hand, move) {
  const spent = new Set(move.cards), remaining = ranksOf(hand.filter(c => !spent.has(c)));
  return [...remaining.values()].reduce((s, count) => s + (count === 1 ? 0.45 : count === 2 ? 0.1 : 0), 0);
}

function isKnownAlly(view, seat) {
  if (seat === null || seat === undefined || seat === view.seat) return false;
  if (view.ownRole === 'partner') return seat === view.landlord;
  if (view.ownRole === 'landlord') return view.revealedPartner === seat;
  return view.revealedPartner !== null && seat !== view.landlord && seat !== view.revealedPartner;
}

export function choosePlay(brain, view) {
  const legal = legalMoves(view.hand, view.tableMove);
  const pass = { cards: [], pattern: null, pass: true, label: 'conserve' };
  if (!legal.length) {
    if (!view.tableMove) throw new Error('Cannot pass when leading');
    return chosen(brain, view, [pass], 'play');
  }
  const moves = legal.map(m => ({ ...m, pass: false }));
  const finish = moves.find(m => m.cards.length === view.hand.length);
  // Taking a legal empty-hand finish is a disclosed rule heuristic, not hidden search.
  if (finish) return chosen(brain, view, [{ ...finish, label: 'finish-hand' }], 'play');
  const scored = moves.map(m => {
    const bomb = m.pattern.type === 'bomb' || m.pattern.type === 'rocket';
    const rem = remainderPenalty(view.hand, m);
    return { m, conserve: m.cards.length * 1.8 - m.pattern.mainRank * 0.32 - Number(bomb) * 5 - rem,
      attack: m.cards.length * 3.0 - m.pattern.mainRank * 0.08 - Number(bomb) * 1.2 - rem * 0.7 };
  });
  const compare = key => (a, b) => b[key] - a[key] || a.m.pattern.mainRank - b.m.pattern.mainRank || a.m.cards[0] - b.m.cards[0];
  const attack = { ...[...scored].sort(compare('attack'))[0].m, label: 'attack' };
  let conserve;
  if (view.tableMove) {
    // Passing can conserve control, particularly when a publicly known teammate leads.
    // The alternative always remains an actual legal beat when one exists.
    conserve = { ...pass, label: isKnownAlly(view, view.tableSeat) ? 'support-known-ally' : 'conserve' };
  } else {
    conserve = [...scored].sort(compare('conserve')).map(x => x.m)
      .find(m => m.cards.join(',') !== attack.cards.join(','));
    if (conserve) conserve = { ...conserve, label: 'conserve' };
  }
  return chosen(brain, view, conserve ? [conserve, attack] : [attack], 'play');
}

export function packDecision(result) {
  if (!result?.decision) return null;
  const d = result.decision;
  return { action: d.action, probability: [...d.probability], forced: !!result.forced, silent: !!d.silent,
    features: d.features.flatMap((v, k) => v ? [[k, Number(v.toFixed(8))]] : []) };
}

export function publicDecision(result) {
  return { trace: result.decision?.trace || null, probability: result.decision?.probability || null,
    activeKCs: result.decision?.activeKCs || 0, simulatedMs: result.decision?.simulatedMs || 0,
    forced: !!result.forced, silent: !!result.decision?.silent,
    // Unchosen cards and teammate-dependent labels remain private policy details.
    candidateIndex: result.candidateIndex ?? null, candidateCount: result.candidates?.length || 0 };
}

export function reinforceRecent(brain, credits, signal, source = 'match') {
  const recent = credits.slice(-CREDIT_WINDOW);
  const eligible = source === 'match' ? recent.filter(d => !d.forced && !d.silent) : recent.filter(d => !d.silent);
  const updates = [];
  for (const packed of eligible) {
    const features = Array(BRAIN_MODEL.kc).fill(0);
    for (const [i, value] of packed.features) features[i] = value;
    const creditPulse = source !== 'match';
    // Credit feedback is an explicitly engineered modulation pulse. Offset the
    // reinforcement input by the current baseline to ensure the requested signed
    // prediction-error pulse, even if past game expectations are large.
    const modelReward = creditPulse ? brain.baseline + signal : signal;
    const update = reinforceBrain(brain, { action: packed.action, probability: packed.probability, features }, modelReward);
    updates.push({ ...update, modelReward });
  }
  return { source, reward: signal, delta: updates.length ? mean(updates.map(x => x.delta)) : 0,
    expected: updates[0]?.expected ?? brain.baseline,
    changedEdges: updates.reduce((s, x) => s + x.changedEdges, 0),
    meanChange: updates.length ? mean(updates.map(x => x.meanChange)) : 0,
    decisionsReinforced: updates.length, learning: brain.learning,
    modelReward: updates.length ? mean(updates.map(x => x.modelReward)) : null,
    label: source === 'match' ? 'Engineered team-outcome learning signal; not measured dopamine'
      : 'Automatic virtual-credit modulation pulse; heuristic signal, not measured dopamine or a voluntary borrowing choice' };
}
