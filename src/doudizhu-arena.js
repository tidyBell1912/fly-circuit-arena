import { MODEL as BRAIN_MODEL } from './brain.js';
import { shuffleDeck, sortCards, classifyMove, beats, RULES_NOTES } from './doudizhu-rules.js';
import { createBrain, chooseBid, chooseIdentity, choosePlay, packDecision, publicDecision, reinforceRecent, CREDIT_WINDOW } from './doudizhu-policy.js';

export const NAMES = ['Iris', 'Cobalt', 'Mica', 'Ember', 'Jade'];
export const BASE_STAKE = 200;
export const DURATIONS = { deal: 6000, bid: 3000, play: 3000, bomb: 5000, settle: 12000,
  roundEnd: 12000, loanPositive: 4000, loanNegative: 6000, seasonEnd: 15000 };
export const GAME_MODEL = { ...BRAIN_MODEL, version: 'ddz-five-v1.0.0', namespace: 'ddz-five-v1',
  game: 'five-player-partnership-doudizhu', players: 5, cards: 108, initialBalance: 10000, baseStake: BASE_STAKE,
  creditWindow: CREDIT_WINDOW, rules: RULES_NOTES,
  description: 'Five independent connectome-derived states choose between engineered legal card candidates. Card rules, sensory encoding, team rewards, credit pulses and season scoring are explicit model assumptions.' };
export const MODEL = GAME_MODEL;
const zeros = () => Array(5).fill(0);
const freshCredits = () => Array.from({ length: 5 }, () => []);

function rng(state) {
  let x = state.dealRng | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  state.dealRng = x >>> 0;
  return state.dealRng / 4294967296;
}
function freshSeason(id, at) {
  return { id, round: 1, hand: 1, startedAt: at, scores: zeros(), netWins: zeros(), wins: zeros(),
    champion: null, roundReason: null, standings: [], rounds: [] };
}
function freshMatch(id, at) {
  return { id, startedAt: at, completedAt: null, landlord: null, bid: 0, bids: [], plays: [],
    winner: null, winningTeam: null, winningSeats: [], bombs: 0, multiplier: 1,
    partnerRevealed: false, identityRevealedAt: null, pointsDelta: zeros(), balancesAfter: null,
    baseUnit: 0, redeals: 0 };
}
function setPhase(state, phase, at, duration = DURATIONS[phase]) {
  state.phase = phase; state.phaseStart = at; state.deadline = at + duration;
}
function remember(state, seat, result, at) {
  if (result.decision?.neural) {
    state.lastNeural ??= Array(5).fill(null);
    state.lastNeural[seat] = { ...result.decision.neural, at,
      decisionNumber: state.brains[seat].decisions, source: 'decision' };
  }
  const credit = packDecision(result);
  if (credit) {
    state.credits[seat].push(credit);
    state.credits[seat] = state.credits[seat].slice(-CREDIT_WINDOW);
    state.recentCredits[seat] = state.credits[seat].map(d => structuredClone(d));
  }
}
function deal(state, at, redeal = false) {
  if (!redeal) state.match = freshMatch(state.match ? state.match.id + 1 : 1, at);
  else state.match.redeals++;
  const deck = shuffleDeck(() => rng(state));
  state.hands = Array.from({ length: 5 }, (_, seat) => sortCards(deck.slice(seat * 20, seat * 20 + 20)));
  state.bottom = deck.slice(100);
  state.bottomAssigned = false;
  state.privatePartner = null; state.identityCard = null;
  state.turn = (state.match.id - 1 + state.match.redeals) % 5;
  state.bidding = { turn: state.turn, index: 0, order: Array.from({ length: 5 }, (_, i) => (state.turn + i) % 5),
    bids: Array(5).fill(null), highest: 0, highestSeat: null, complete: false };
  state.match.bids = []; state.match.landlord = null; state.match.bid = 0;
  state.tableMove = null; state.tableSeat = null; state.lastPlay = null; state.lastAction = null;
  state.passCount = 0; state.credits = freshCredits(); state.credit = null;
  setPhase(state, 'deal', at);
}

export function createArena(now, seed = 1) {
  const state = { schema: 2, namespace: GAME_MODEL.namespace, model: GAME_MODEL.version,
    createdAt: now, revision: 0, dealRng: (seed >>> 0) || 1,
    roster: NAMES.map((name, id) => ({ id, name })),
    brains: NAMES.map((_, i) => createBrain(((seed >>> 0) ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0)),
    balances: Array(5).fill(10000), debts: zeros(), principal: zeros(), loanCounts: zeros(),
    season: freshSeason(1, now), lastSeason: null, lastRoundSummary: null,
    match: null, hands: [], bottom: [], bottomAssigned: false, turn: 0,
    tableMove: null, tableSeat: null, lastPlay: null, lastAction: null, passCount: 0,
    privatePartner: null, identityCard: null, bidding: null,
    credits: freshCredits(), recentCredits: freshCredits(), feedback: Array(5).fill(null), lastNeural: Array(5).fill(null),
    credit: null, pendingAfterCredit: null,
    stats: { matches: 0, rounds: 0, wins: zeros(), points: zeros(), landlordWins: 0, farmerWins: 0,
      seasons: 0, seasonWins: zeros(), borrowed: zeros(), interest: zeros(), creditEvents: 0,
      creditSignals: zeros(), redeals: 0 }, delayedMs: 0, error: null };
  deal(state, now);
  return state;
}

/** Whitelist construction is the only gateway from omniscient referee state to policy. */
export function getPolicyView(state, seat) {
  const landlord = state.match.landlord;
  const ownRole = landlord === null ? 'unassigned' : seat === landlord ? 'landlord'
    : seat === state.privatePartner ? 'partner' : 'farmer';
  const revealedPartner = state.match.partnerRevealed ? state.privatePartner : null;
  return { seat, hand: [...state.hands[seat]], handCounts: state.hands.map(h => h.length),
    ownRole, landlord, revealedPartner,
    identityCard: ownRole === 'landlord' || ownRole === 'partner' || state.match.partnerRevealed ? state.identityCard : null,
    bottom: state.bottomAssigned ? [...state.bottom] : [], highestBid: state.bidding.highest,
    publicBids: state.match.bids.map(b => ({ seat: b.seat, bid: b.bid })),
    tableMove: state.tableMove ? { ...state.tableMove } : null, tableSeat: state.tableSeat,
    publicPlays: state.match.plays.slice(-15).map(p => ({ seat: p.seat, cards: [...p.cards], pattern: p.pattern ? { ...p.pattern } : null, pass: p.pass })),
    balance: state.balances[seat], debt: state.debts[seat] };
}

function assignLandlord(state, at) {
  const seat = state.bidding.highestSeat;
  state.match.landlord = seat; state.match.bid = state.bidding.highest;
  state.hands[seat] = sortCards([...state.hands[seat], ...state.bottom]);
  state.bottomAssigned = true; state.bidding.complete = true;
  const identity = chooseIdentity(state.brains[seat], getPolicyView(state, seat));
  remember(state, seat, identity, at);
  state.identityCard = identity.token;
  if (identity.token !== null) {
    state.privatePartner = state.hands.findIndex((hand, other) => other !== seat && hand.some(c => c % 54 === identity.token));
    if (state.privatePartner < 0) throw new Error('Identity pair is absent from the other hands');
  } else state.privatePartner = null;
  state.turn = seat; state.bidding.turn = null;
  setPhase(state, 'play', at);
}

export function settleTransfers(balances, winners, unit) {
  if (!Number.isInteger(unit) || unit < 0) throw new Error('Invalid transfer unit');
  if (balances.length !== 5 || balances.some(b => !Number.isInteger(b) || b < 0)) throw new Error('Invalid balances');
  if (!winners.length || winners.length >= 5 || new Set(winners).size !== winners.length || winners.some(s => !Number.isInteger(s) || s < 0 || s >= 5)) throw new Error('Invalid winning team');
  winners = [...winners].sort((a, b) => a - b);
  const delta = zeros(), winnerSet = new Set(winners), transfers = [];
  for (let loser = 0; loser < 5; loser++) {
    if (winnerSet.has(loser)) continue;
    const total = Math.min(balances[loser], unit * winners.length);
    const paidPerWinner = Math.floor(total / winners.length), remainder = total % winners.length;
    for (let i = 0; i < winners.length; i++) {
      // Insolvent losers distribute every available integer bean. Any indivisible
      // remainder follows ascending winner seat, so a one-bean balance cannot stall.
      const winner = winners[i], amount = paidPerWinner + Number(i < remainder);
      delta[loser] -= amount; delta[winner] += amount;
      transfers.push({ from: loser, to: winner, amount });
    }
  }
  return { delta, transfers };
}

function finishMatch(state, seat, at, event) {
  const landlordTeam = [state.match.landlord, state.privatePartner].filter(s => s !== null);
  const landlordWon = landlordTeam.includes(seat);
  const winners = Array.from({ length: 5 }, (_, i) => i).filter(i => landlordTeam.includes(i) === landlordWon);
  state.match.winner = seat; state.match.winningTeam = landlordWon ? 'landlord' : 'farmers';
  state.match.winningSeats = winners; state.match.completedAt = at;
  state.match.multiplier = Math.min(16, 2 ** Math.min(4, state.match.bombs));
  state.match.baseUnit = BASE_STAKE * state.match.bid * state.match.multiplier;
  const { delta, transfers } = settleTransfers(state.balances, winners, state.match.baseUnit);
  state.match.pointsDelta = delta; state.match.transfers = transfers;
  for (let i = 0; i < 5; i++) {
    state.balances[i] += delta[i]; state.stats.points[i] += delta[i]; state.season.netWins[i] += delta[i];
    if (winners.includes(i)) { state.stats.wins[i]++; state.season.wins[i]++; }
    state.feedback[i] = { ...reinforceRecent(state.brains[i], state.credits[i], winners.includes(i) ? 1 : -1, 'match'),
      at, team: winners.includes(i) ? 'won' : 'lost', beans: delta[i] };
  }
  state.match.balancesAfter = [...state.balances];
  state.match.feedback = structuredClone(state.feedback);
  state.match.partner = state.privatePartner;
  state.match.identityCard = state.identityCard;
  state.stats.matches++; state.stats[landlordWon ? 'landlordWins' : 'farmerWins']++;
  event.match = structuredClone(state.match);
  setPhase(state, 'settle', at);
}

function standings(state) {
  return state.roster.map((_, seat) => ({ seat, score: state.season.scores[seat],
    netAssets: state.balances[seat] - state.debts[seat], netWon: state.season.netWins[seat], wins: state.season.wins[seat] }))
    .sort((a, b) => b.score - a.score || b.netWon - a.netWon || b.wins - a.wins || a.seat - b.seat)
    .map((x, i) => ({ ...x, rank: i + 1 }));
}

export function roundEndReason(state) {
  if (state.season.hand >= 5) return 'five-hands';
  const empty = state.balances.map((b, i) => b === 0 ? i : -1).filter(i => i >= 0);
  if (empty.length >= 3) return 'three-empty-balances';
  if (empty.some(i => state.loanCounts[i] >= 1)) return 'repeat-insolvency';
  return null;
}

function closeRound(state, reason, at, event) {
  const interest = state.principal.map(p => Math.ceil(p / 10));
  for (let i = 0; i < 5; i++) { state.debts[i] += interest[i]; state.stats.interest[i] += interest[i]; }
  const netAssets = state.balances.map((b, i) => b - state.debts[i]);
  const ordered = [...netAssets].sort((a, b) => b - a), awards = [10, 6, 3, 1, 0];
  const points = netAssets.map(v => awards[ordered.indexOf(v)]);
  for (let i = 0; i < 5; i++) state.season.scores[i] += points[i];
  const summary = { id: `${state.season.id}-${state.season.round}`, seasonId: state.season.id,
    round: state.season.round, hands: state.season.hand, reason, completedAt: at,
    balances: [...state.balances], debts: [...state.debts], principal: [...state.principal], interest,
    netAssets, awards: points, cumulativeScores: [...state.season.scores] };
  state.season.roundReason = reason; state.season.rounds.push(summary);
  state.season.standings = standings(state); state.lastRoundSummary = summary;
  event.roundSummary = structuredClone(summary);
  setPhase(state, 'roundEnd', at);
}

function creditFeedback(state, sign, at) {
  const source = sign > 0 ? 'credit-positive' : 'credit-negative';
  for (const seat of state.credit.borrowers) {
    state.feedback[seat] = { ...reinforceRecent(state.brains[seat], state.recentCredits[seat], sign, source), at };
    state.stats.creditSignals[seat]++;
  }
}

function startLoansOrDeal(state, at) {
  const borrowers = state.balances.map((b, i) => b === 0 && state.loanCounts[i] === 0 ? i : -1).filter(i => i >= 0);
  if (!borrowers.length) { deal(state, at); return; }
  for (const seat of borrowers) {
    state.balances[seat] += 5000; state.debts[seat] += 5000; state.principal[seat] += 5000;
    state.loanCounts[seat]++; state.stats.borrowed[seat] += 5000;
  }
  state.stats.creditEvents++;
  state.credit = { borrowers, amount: 5000, stage: 'positive', at, positiveSignal: 0.2, negativeSignal: -0.35,
    automatic: true, label: 'Automatic virtual credit; no voluntary borrowing decision' };
  creditFeedback(state, 0.2, at);
  setPhase(state, 'loanPositive', at);
}

export function advanceArena(state, now) {
  if (now < state.deadline) return null;
  const scheduledAt = state.deadline, at = Math.max(now, scheduledAt);
  state.delayedMs = Math.max(0, now - scheduledAt);
  const event = { revision: state.revision + 1, at, scheduledAt, round: null, match: null, roundSummary: null, season: null };
  switch (state.phase) {
    case 'deal': setPhase(state, 'bid', at); break;
    case 'bid': {
      const seat = state.bidding.turn;
      const result = chooseBid(state.brains[seat], getPolicyView(state, seat));
      remember(state, seat, result, at);
      const bid = result.move.bid;
      const row = { seat, bid, at, ...publicDecision(result) };
      state.bidding.bids[seat] = bid; state.match.bids.push(row);
      state.lastAction = { kind: 'bid', seat, playerId: seat, cards: [], pattern: null, pass: bid === 0, bid, at, ...publicDecision(result) };
      if (bid > state.bidding.highest) { state.bidding.highest = bid; state.bidding.highestSeat = seat; }
      state.bidding.index++;
      if (bid === 3 || state.bidding.index === 5) {
        if (state.bidding.highest === 0) { state.stats.redeals++; deal(state, at, true); }
        else assignLandlord(state, at);
      } else {
        state.bidding.turn = state.bidding.order[state.bidding.index]; state.turn = state.bidding.turn;
        setPhase(state, 'bid', at);
      }
      break;
    }
    case 'play': {
      const seat = state.turn, result = choosePlay(state.brains[seat], getPolicyView(state, seat));
      const move = result.move; remember(state, seat, result, at);
      const pattern = move.pass ? null : classifyMove(move.cards);
      if (move.pass ? !state.tableMove : (!pattern || !beats(pattern, state.tableMove))) throw new Error('Policy returned an illegal card move');
      if (!move.pass && move.cards.some(c => !state.hands[seat].includes(c))) throw new Error('Policy played an unowned card');
      const row = { id: `${state.match.id}-${state.match.plays.length + 1}`, matchId: state.match.id,
        number: state.match.plays.length + 1, kind: 'play', seat, playerId: seat, cards: [...move.cards],
        pattern, pass: !!move.pass, at, ...publicDecision(result), model: GAME_MODEL.version };
      if (move.pass) {
        state.passCount++;
        if (state.passCount === 4) {
          state.turn = state.tableSeat; state.tableMove = null; state.tableSeat = null; state.passCount = 0;
          row.cleared = true;
        } else state.turn = (seat + 1) % 5;
      } else {
        const spent = new Set(move.cards);
        state.hands[seat] = state.hands[seat].filter(c => !spent.has(c));
        state.tableMove = pattern; state.tableSeat = seat; state.passCount = 0;
        state.lastPlay = { ...row }; state.turn = (seat + 1) % 5;
        if (pattern.bomb || pattern.rocket) { state.match.bombs++; state.match.multiplier = Math.min(16, 2 ** Math.min(4, state.match.bombs)); }
        if (seat === state.privatePartner && move.cards.some(c => c % 54 === state.identityCard)) {
          state.match.partnerRevealed = true; state.match.identityRevealedAt ??= at;
          row.identityRevealed = seat; state.lastPlay.identityRevealed = seat;
        }
      }
      state.lastAction = row; state.match.plays.push(row); state.stats.rounds++;
      event.round = structuredClone(row);
      if (state.hands[seat].length === 0) finishMatch(state, seat, at, event);
      else setPhase(state, 'play', at, pattern?.bomb || pattern?.rocket ? DURATIONS.bomb : DURATIONS.play);
      break;
    }
    case 'settle': {
      const reason = roundEndReason(state);
      if (reason) closeRound(state, reason, at, event);
      else { state.season.hand++; startLoansOrDeal(state, at); }
      break;
    }
    case 'loanPositive': {
      state.credit.stage = 'negative'; state.credit.at = at;
      creditFeedback(state, -0.35, at); setPhase(state, 'loanNegative', at); break;
    }
    case 'loanNegative': deal(state, at); break;
    case 'roundEnd': {
      if (state.season.round === 3) {
        state.season.standings = standings(state); state.season.champion = state.season.standings[0].seat;
        state.season.completedAt = at; state.stats.seasons++; state.stats.seasonWins[state.season.champion]++;
        state.lastSeason = { ...structuredClone(state.season), balances: [...state.balances], debts: [...state.debts] };
        event.season = structuredClone(state.lastSeason); setPhase(state, 'seasonEnd', at);
      } else {
        state.season.round++; state.season.hand = 1; state.season.roundReason = null; state.loanCounts = zeros();
        startLoansOrDeal(state, at);
      }
      break;
    }
    case 'seasonEnd': {
      state.balances = Array(5).fill(10000); state.debts = zeros(); state.principal = zeros(); state.loanCounts = zeros();
      state.season = freshSeason(state.season.id + 1, at); startLoansOrDeal(state, at); break;
    }
    default: throw new Error('Unknown Dou Dizhu phase');
  }
  state.error = null; state.revision++; event.phase = state.phase;
  return event;
}

function visibleMatch(state) {
  const m = state.match;
  // Completed replay may disclose team identity; an active table does not expose it.
  const reveal = m.partnerRevealed || m.completedAt !== null;
  return { ...m, partner: reveal ? state.privatePartner : null,
    identityCard: reveal ? state.identityCard : null };
}

export function publicArena(state, now = Date.now()) {
  const reveal = state.match.partnerRevealed || state.match.completedAt !== null;
  const roles = state.roster.map((_, i) => state.match.landlord === null ? 'unassigned'
    : i === state.match.landlord ? 'landlord' : reveal ? i === state.privatePartner ? 'partner' : 'farmer' : 'unrevealed');
  return { serverTime: now, revision: state.revision, createdAt: state.createdAt, phase: state.phase,
    phaseLabel: state.phase, phaseStart: state.phaseStart, deadline: state.deadline,
    delayed: now > state.deadline + 2500 || state.delayedMs > 5000, error: state.error, model: GAME_MODEL,
    roster: state.roster.map(x => ({ ...x })), players: state.roster.map((x, seat) => ({ ...x, seat, role: roles[seat],
      balance: state.balances[seat], debt: state.debts[seat], score: state.season.scores[seat] })),
    hands: state.hands.map(h => [...h]), handCounts: state.hands.map(h => h.length),
    turn: state.turn, lastPlay: state.lastPlay, tableMove: state.tableMove, tableSeat: state.tableSeat,
    lastAction: state.lastAction, bottom: state.bottomAssigned ? [...state.bottom] : [], bottomCount: 8,
    roles, landlord: state.match.landlord, partner: reveal ? state.privatePartner : null,
    identityCard: reveal ? state.identityCard : null, partnerRevealed: state.match.partnerRevealed,
    bidding: structuredClone(state.bidding), match: visibleMatch(state),
    season: { ...structuredClone(state.season), standings: standings(state) },
    balances: [...state.balances], debts: [...state.debts], principal: [...state.principal], loanCounts: [...state.loanCounts],
    credit: state.credit ? structuredClone(state.credit) : null,
    feedback: structuredClone(state.feedback), stats: structuredClone(state.stats),
    lastNeural: structuredClone(state.lastNeural || Array(5).fill(null)),
    lastRoundSummary: state.lastRoundSummary, lastSeason: state.lastSeason,
    brains: state.brains.map((b, i) => ({ name: NAMES[i], decisions: b.decisions, updates: b.updates,
      active: state.turn === i, learning: b.learning })) };
}
