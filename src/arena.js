import { createBrain, decideBrain, reinforceBrain, MODEL } from './brain.js';

export const DURATIONS = { intro: 15000, predict: 4000, think: 6000, sealed: 2000, reveal: 12000, feedback: 6000, recap: 15000 };
export const NAMES = ['Iris', 'Cobalt', 'Mica'];
export const PHASES = { intro: 'A new sugar heist', predict: 'Mica places a bet', think: 'Read the rival. Pick a vault.', sealed: 'Routes locked. Ready?', reveal: 'The heist is on', feedback: 'Reward. Learn. Try again.', recap: 'Match complete' };

export function createArena(now, seed = 1) {
  return {
    schema: 1, model: MODEL.version, createdAt: now, revision: 0,
    phase: 'intro', phaseStart: now, deadline: now + DURATIONS.intro,
    brains: [createBrain(seed ^ 0x13579), createBrain(seed ^ 0x24680), createBrain(seed ^ 0x56789)],
    match: { id: 1, startedAt: now, hunter: 0, score: [0, 0], round: 1, rounds: [] },
    history: [], pending: null, lastRound: null,
    stats: { rounds: 0, matches: 0, roundWins: [0, 0], matchWins: [0, 0], predictions: 0, correct: 0, net: 0 },
    lastFeedback: [null, null, null], delayedMs: 0, error: null,
  };
}

export function advanceArena(state, now) {
  if (now < state.deadline) return null;
  const scheduledAt = state.deadline;
  state.delayedMs = Math.max(0, now - scheduledAt);
  const at = Math.max(now, scheduledAt);
  const event = { revision: state.revision + 1, at, scheduledAt, round: null, match: null };
  const setPhase = phase => { state.phase = phase; state.phaseStart = at; state.deadline = at + DURATIONS[phase]; };
  const beginRound = () => {
    state.pending = { id: `${state.match.id}-${state.match.round}`, matchId: state.match.id, number: state.match.round, startedAt: at, hunter: state.match.hunter };
    setPhase('predict');
  };
  switch (state.phase) {
    case 'intro': beginRound(); break;
    case 'predict': {
      state.pending.prediction = decideBrain(state.brains[2], { agent: 2, hunter: state.match.hunter, history: state.history });
      state.pending.predictionLockedAt = at;
      setPhase('think'); break;
    }
    case 'think': {
      // Both actors see only the same completed-round history, never each other's current output.
      const history = state.history;
      state.pending.decisions = [0, 1].map(agent => decideBrain(state.brains[agent], { agent, hunter: state.match.hunter, history }));
      state.pending.choicesLockedAt = at;
      setPhase('sealed'); break;
    }
    case 'sealed': {
      const p = state.pending;
      const same = p.decisions[0].action === p.decisions[1].action;
      p.winner = same ? p.hunter : 1 - p.hunter;
      p.correct = p.prediction.action === p.winner;
      p.revealedAt = at;
      state.match.score[p.winner]++;
      state.lastRound = publicRound(p);
      setPhase('reveal'); break;
    }
    case 'reveal': {
      const p = state.pending;
      p.feedback = [0, 1].map(i => reinforceBrain(state.brains[i], p.decisions[i], i === p.winner ? 1 : -1));
      p.feedback.push(reinforceBrain(state.brains[2], p.prediction, p.correct ? 1 : -1));
      p.completedAt = at;
      state.lastFeedback = p.feedback;
      state.stats.rounds++;
      state.stats.roundWins[p.winner]++;
      state.stats.predictions++;
      state.stats.correct += Number(p.correct);
      state.stats.net += p.correct ? 1 : -1;
      const row = publicRound(p);
      state.history.push({ actions: row.actions, winner: p.winner, hunter: p.hunter, correct: p.correct });
      state.history = state.history.slice(-100);
      state.match.rounds.push(row);
      state.lastRound = row;
      event.round = row;
      setPhase('feedback'); break;
    }
    case 'feedback': {
      if (state.match.round < 5) { state.match.round++; beginRound(); }
      else {
        const winner = state.match.score[0] > state.match.score[1] ? 0 : 1;
        state.match.winner = winner;
        state.match.completedAt = at;
        state.stats.matches++;
        state.stats.matchWins[winner]++;
        event.match = structuredClone(state.match);
        setPhase('recap');
      }
      break;
    }
    case 'recap': {
      state.match = { id: state.match.id + 1, startedAt: at, hunter: 1 - state.match.hunter, score: [0, 0], round: 1, rounds: [] };
      state.pending = null;
      setPhase('intro'); break;
    }
    default: throw new Error('Unknown arena phase');
  }
  state.error = null;
  state.revision++;
  event.phase = state.phase;
  return event;
}

function publicDecision(d) {
  return { action: d.action, probability: d.probability, trace: d.trace, activeKCs: d.activeKCs, simulatedMs: d.simulatedMs };
}

export function publicRound(p) {
  return {
    id: p.id, matchId: p.matchId, number: p.number, hunter: p.hunter,
    actions: p.decisions.map(d => d.action), winner: p.winner,
    prediction: p.prediction.action, correct: p.correct, stake: 1,
    decisions: p.decisions.map(publicDecision), observer: publicDecision(p.prediction),
    feedback: p.feedback || null,
    startedAt: p.startedAt, predictionLockedAt: p.predictionLockedAt,
    choicesLockedAt: p.choicesLockedAt, revealedAt: p.revealedAt, completedAt: p.completedAt || null,
    model: MODEL.version,
  };
}

export function publicArena(state, now = Date.now()) {
  const visible = ['reveal', 'feedback'].includes(state.phase) ? state.lastRound : null;
  return {
    serverTime: now, revision: state.revision, createdAt: state.createdAt,
    phase: state.phase, phaseLabel: PHASES[state.phase], phaseStart: state.phaseStart, deadline: state.deadline,
    delayed: now > state.deadline + 2500 || state.delayedMs > 5000,
    error: state.error, model: MODEL,
    match: { id: state.match.id, hunter: state.match.hunter, score: state.match.score, round: state.match.round, winner: state.match.winner ?? null, startedAt: state.match.startedAt, rounds: state.match.rounds },
    predictionLocked: !!state.pending?.predictionLockedAt,
    lockedPrediction: state.pending?.predictionLockedAt ? { agent: state.pending.prediction.action, lockedAt: state.pending.predictionLockedAt } : null,
    choicesLocked: !!state.pending?.choicesLockedAt,
    currentRound: visible, lastRound: state.lastRound,
    stats: state.stats,
    recentAccuracy: state.history.length ? state.history.filter(r => r.correct).length / state.history.length : null,
    feedback: state.lastFeedback,
    brains: state.brains.map((b, i) => ({ name: NAMES[i], decisions: b.decisions, updates: b.updates })),
  };
}
