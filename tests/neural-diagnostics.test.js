import test from 'node:test';
import assert from 'node:assert/strict';
import circuit from '../data/circuit.json' with { type: 'json' };
import { createBrain, decideBrain, reinforceBrain, MODEL } from '../src/brain.js';
import { createArena, advanceArena, publicArena } from '../src/doudizhu-arena.js';

const COLUMNS = ['bodyId', 'role', 'spikeCount', 'rateHz', 'finalVoltage', 'finalActivity'];
const ROLE_COUNTS = { PN: 131, KC: 850, MBON: 2, APL: 1 };
const activeNodes = circuit.nodes.filter(node => node.role !== 'DAN');
const kenyonNodes = circuit.nodes.filter(node => node.role === 'KC');
const anatomy = circuit.nodes.filter(node => node.role === 'DAN').map(node => [node.bodyId, 'DAN']);
const idsByRole = new Map(activeNodes.map(node => [node.bodyId, node.role]));
const aplId = circuit.nodes.find(node => node.role === 'APL').bodyId;

function verifyNeural(neural, decision = null) {
  assert.equal(neural.schema, 1);
  assert.equal(neural.durationMs, 160);
  assert.equal(neural.dtMs, 1);
  assert.equal(neural.voltageUnits, 'dimensionless model state');
  assert.equal(neural.voltagePrecision, 1e-6);
  assert.deepEqual(neural.columns, COLUMNS);
  assert.equal(neural.neurons.length, 984);
  assert.equal(new Set(neural.neurons.map(row => row[0])).size, 984);
  assert.deepEqual(new Set(neural.neurons.map(row => row[0])), new Set(activeNodes.map(node => node.bodyId)));
  assert.deepEqual(neural.anatomyOnly, anatomy);
  assert.equal(neural.anatomyOnly.length, 17);

  const rows = new Map(neural.neurons.map(row => [row[0], row]));
  const roles = { PN: 0, KC: 0, MBON: 0, APL: 0 };
  const eventCounts = new Map();
  const eventBins = Array.from({ length: 16 }, () => ({ PN: 0, KC: 0, MBON07: 0, MBON11: 0 }));
  const lastSpike = new Map();
  let previousTime = -1;
  for (const event of neural.spikes) {
    assert.equal(event.length, 2);
    const [time, id] = event;
    assert(Number.isInteger(time) && time >= 0 && time < 160);
    assert(time >= previousTime, 'spikes must retain chronological ordering');
    previousTime = time;
    const role = idsByRole.get(id);
    assert(['PN', 'KC', 'MBON'].includes(role), 'only modeled spiking neurons may emit events');
    if (lastSpike.has(id)) {
      const spacing = time - lastSpike.get(id);
      assert(spacing >= (role === 'KC' ? 6 : role === 'MBON' ? 9 : 1), 'spikes respect the solver refractory interval');
    }
    lastSpike.set(id, time);
    eventCounts.set(id, (eventCounts.get(id) || 0) + 1);
    const traceRole = role === 'MBON' ? (id === 18603 ? 'MBON07' : 'MBON11') : role;
    eventBins[Math.floor(time / 10)][traceRole]++;
  }

  for (const row of neural.neurons) {
    assert.equal(row.length, COLUMNS.length);
    const [id, role, count, rate, voltage, activity] = row;
    assert.equal(role, idsByRole.get(id));
    roles[role]++;
    if (role === 'APL') {
      assert.deepEqual([count, rate, voltage], [null, null, null]);
      assert(Number.isFinite(activity) && activity >= 0);
    } else {
      assert(Number.isInteger(count) && count >= 0);
      assert.equal(count, eventCounts.get(id) || 0, `spike count for ${id}`);
      assert.equal(rate, count * 6.25, `rate in Hz for ${id}`);
      assert.equal(activity, null);
      if (role === 'PN') assert.equal(voltage, null);
      else {
        assert(Number.isFinite(voltage) && voltage >= 0);
        assert.equal(voltage, Number(voltage.toFixed(6)), 'voltage retains six decimal places of model precision');
      }
    }
  }
  assert.deepEqual(roles, ROLE_COUNTS);
  assert.equal(neural.analog.APL.length, 160);
  for (let time = 0; time < 160; time++) {
    const sample = neural.analog.APL[time];
    assert.equal(sample.length, 2);
    assert.equal(sample[0], time);
    assert(Number.isFinite(sample[1]) && sample[1] >= 0);
  }
  assert.equal(rows.get(aplId)[5], neural.analog.APL.at(-1)[1]);

  if (decision) {
    let mbon07 = 0, mbon11 = 0;
    for (const key of ['PN', 'KC', 'MBON07', 'MBON11', 'APL']) assert.equal(decision.trace[key].length, 16);
    for (let bin = 0; bin < 16; bin++) {
      assert.equal(decision.trace.PN[bin], Math.round(eventBins[bin].PN * 100 / MODEL.pn));
      assert.equal(decision.trace.KC[bin], Math.round(eventBins[bin].KC * 100 / MODEL.kc));
      mbon07 += eventBins[bin].MBON07;
      mbon11 += eventBins[bin].MBON11;
      assert.equal(decision.trace.MBON07[bin], mbon07);
      assert.equal(decision.trace.MBON11[bin], mbon11);
      // The trace rounds the raw state to four decimals; diagnostics round to six.
      const analog = neural.analog.APL[bin * 10 + 9][1];
      assert(Math.abs(decision.trace.APL[bin] - analog) <= 0.00005 + 0.0000006);
    }
    assert.equal(rows.get(18603)[2], decision.trace.MBON07.at(-1));
    assert.equal(rows.get(10704)[2], decision.trace.MBON11.at(-1));
    const counts = kenyonNodes.map(node => rows.get(node.bodyId)[2]);
    const total = counts.reduce((sum, count) => sum + count, 0);
    assert(total > 0);
    assert.deepEqual(decision.features, counts.map(count => count / Math.max(1 / MODEL.kc, total / MODEL.kc)));
    assert.equal(decision.activeKCs, counts.filter(count => count > 0).length);
  }
  return rows;
}

test('recordNeurons is opt-in and leaves choices, learning, RNG and all brain state unchanged', () => {
  const contexts = [
    { cue: [0, 1] },
    { cue: [1, 0.4, 0.6, 0.2, 0.8, 0.9, 0.5, 0.1] },
    { cue: [1, 0.8, 0, 0.5, 0.3, 0.2, 0.7, 0.4] },
    { agent: 1, hunter: 0, history: [{ actions: [0, 1], winner: 1 }, { actions: [1, 0], winner: 0 }] },
  ];
  for (const seed of [1, 19, 3123, 0xdeadbeef]) {
    for (const learning of [true, false]) {
      const plainBrain = createBrain(seed, { learning });
      const recordedBrain = createBrain(seed, { learning });
      for (let round = 0; round < 12; round++) {
        const context = contexts[round % contexts.length];
        const options = round % 3 === 0 ? { threshold: 1.8 } : {};
        const plain = decideBrain(plainBrain, context, options);
        const recorded = decideBrain(recordedBrain, context, { ...options, recordNeurons: true });
        assert(!Object.hasOwn(plain, 'neural'));
        const { neural, ...withoutDiagnostics } = recorded;
        assert.deepEqual(withoutDiagnostics, plain);
        assert.deepEqual(recordedBrain, plainBrain, `decision state at seed ${seed}, round ${round}`);
        verifyNeural(neural, recorded);
        const reward = [1, -1, 0.2, -0.35][round % 4];
        assert.deepEqual(reinforceBrain(recordedBrain, recorded, reward), reinforceBrain(plainBrain, plain, reward));
        assert.deepEqual(recordedBrain, plainBrain, `learned state at seed ${seed}, round ${round}`);
      }
    }
  }
  const explicitlyDisabled = decideBrain(createBrain(19), { cue: [0, 1] }, { recordNeurons: false });
  assert(!Object.hasOwn(explicitlyDisabled, 'neural'));
});

test('the neuron table, spike raster, analog samples and decision summaries agree', () => {
  const brain = createBrain(12345);
  const decision = decideBrain(brain, { cue: [1, 0.3, 0.6, 0.4, 0.8, 0.2, 0.5, 0.1] }, { recordNeurons: true });
  const rows = verifyNeural(decision.neural, decision);
  assert(decision.neural.spikes.length > 0);
  assert([...rows.values()].some(row => row[1] === 'KC' && row[4] > 0), 'voltage diagnostics include actual nonzero terminal state');
  const saved = structuredClone(decision.neural);
  const subsequent = decideBrain(brain, { cue: [0, 1] }, { recordNeurons: true });
  assert.deepEqual(decision.neural, saved, 'a later decision must not overwrite the earlier snapshot');
  assert.notStrictEqual(subsequent.neural.neurons, decision.neural.neurons);
  assert.notStrictEqual(subsequent.neural.spikes, decision.neural.spikes);
  assert.notStrictEqual(subsequent.neural.analog.APL, decision.neural.analog.APL);
});

test('silent episodes throw identically and retain truthful zero-activity diagnostics without extra RNG use', () => {
  for (const seed of [1, 19, 0xffffffff]) {
    const plainBrain = createBrain(seed), recordedBrain = createBrain(seed);
    const before = structuredClone(plainBrain);
    const failures = [];
    for (const [brain, recordNeurons] of [[plainBrain, false], [recordedBrain, true]]) {
      try {
        decideBrain(brain, { cue: [0, 1] }, { baseRate: 0, rateGain: 0, recordNeurons });
        assert.fail('a stimulus without input spikes cannot produce Kenyon activity');
      } catch (error) { failures.push(error); }
    }
    assert.equal(failures[0].message, 'No Kenyon activity for this stimulus');
    assert.equal(failures[1].message, failures[0].message);
    assert(!Object.hasOwn(failures[0], 'neural'));
    assert.deepEqual(recordedBrain, plainBrain);
    assert.notEqual(plainBrain.rng, before.rng, 'the unchanged solver still samples each PN each millisecond');
    assert.deepEqual({ ...plainBrain, rng: before.rng }, before, 'the failed episode only advances RNG');
    const neural = failures[1].neural;
    verifyNeural(neural);
    assert.deepEqual(neural.spikes, []);
    assert(neural.analog.APL.every(([, value]) => value === 0));
    for (const [, role, count, rate, voltage, activity] of neural.neurons) {
      if (role === 'APL') assert.deepEqual([count, rate, voltage, activity], [null, null, null, 0]);
      else assert.deepEqual([count, rate, voltage, activity], [0, 0, role === 'PN' ? null : 0, null]);
    }
  }
});

test('arena keeps five independent latest snapshots and keeps diagnostics out of play history', () => {
  const arena = createArena(1000, 1);
  assert.deepEqual(arena.lastNeural, Array(5).fill(null));
  assert.deepEqual(publicArena(arena, 1000).lastNeural, Array(5).fill(null));
  const sawUpdates = Array(5).fill(0);
  let steps = 0;
  while ((sawUpdates.some(count => count < 2) || arena.match.plays.length < 12) && steps++ < 150) {
    const previous = arena.lastNeural.slice();
    const beforeCounts = arena.brains.map(brain => brain.decisions);
    const at = arena.deadline;
    const event = advanceArena(arena, at);
    for (let seat = 0; seat < 5; seat++) {
      const latest = arena.lastNeural[seat];
      if (arena.brains[seat].decisions > beforeCounts[seat]) {
        sawUpdates[seat]++;
        assert(latest);
        assert.notStrictEqual(latest, previous[seat]);
        assert.equal(latest.at, at);
        assert.equal(latest.decisionNumber, arena.brains[seat].decisions);
        assert.equal(latest.source, 'decision');
        verifyNeural(latest);
      } else assert.strictEqual(latest, previous[seat], 'another player must not overwrite this player snapshot');
    }
    for (const row of [arena.lastAction, arena.lastPlay, ...arena.match.plays, ...arena.match.bids, event?.round].filter(Boolean)) {
      assert(!Object.hasOwn(row, 'neural'));
      assert.doesNotMatch(JSON.stringify(row), /"(?:neurons|anatomyOnly|lastNeural)":/);
    }
  }
  assert(steps < 150, 'each player should receive repeated snapshots within the bounded run');
  assert(sawUpdates.every(count => count >= 2));
  assert.equal(new Set(arena.lastNeural).size, 5);
  assert.equal(new Set(arena.lastNeural.map(snapshot => snapshot.neurons)).size, 5);
  const published = publicArena(arena, arena.deadline);
  assert.deepEqual(published.lastNeural, arena.lastNeural);
  published.lastNeural[0].neurons[0][2] = -123;
  assert.notEqual(arena.lastNeural[0].neurons[0][2], -123, 'public snapshots must not alias referee state');
});

test('older arena checkpoints lazily gain latest-neuron storage on their next decision', () => {
  const arena = createArena(0, 123);
  delete arena.lastNeural;
  assert.deepEqual(publicArena(arena, 0).lastNeural, Array(5).fill(null));
  advanceArena(arena, arena.deadline);
  assert.equal(arena.phase, 'bid');
  const seat = arena.bidding.turn;
  advanceArena(arena, arena.deadline);
  assert.equal(arena.lastNeural.length, 5);
  assert(arena.lastNeural[seat]);
  assert.equal(arena.lastNeural[seat].decisionNumber, arena.brains[seat].decisions);
  verifyNeural(arena.lastNeural[seat]);
});
