import circuit from '../data/circuit.json' with { type: 'json' };

const pn = circuit.nodes.filter(n => n.role === 'PN');
const kc = circuit.nodes.filter(n => n.role === 'KC');
const pIndex = new Map(pn.map((n, i) => [n.bodyId, i]));
const kIndex = new Map(kc.map((n, i) => [n.bodyId, i]));
const outputs = [18603, 10704];
const n = kc.length;
const inputTotals = new Float64Array(n);
const edges = circuit.edges.filter(e => e.role === 'PN->KC');
for (const e of edges) inputTotals[kIndex.get(e.target)] += e.synapses;
const pnTargets = pn.map(() => []);
for (const e of edges) {
  const p = pIndex.get(e.source), k = kIndex.get(e.target);
  // Receptor detail is unavailable: inhibitory sign for GABA/glutamate is a declared model assumption.
  const sign = pn[p].consensusNt === 'acetylcholine' ? 1 : -1;
  pnTargets[p].push([k, sign * e.synapses / inputTotals[k]]);
}
const base = [new Float64Array(n), new Float64Array(n)];
for (const e of circuit.edges.filter(e => e.role === 'KC->MBON')) base[outputs.indexOf(e.target)][kIndex.get(e.source)] = e.synapses;
for (const b of base) { const mean = b.reduce((a, x) => a + x, 0) / n; for (let i = 0; i < n; i++) b[i] /= mean; }
const aplIn = new Float64Array(n), aplOut = new Float64Array(n);
for (const e of circuit.edges) {
  if (e.role === 'KC->APL') aplIn[kIndex.get(e.source)] = e.synapses;
  if (e.role === 'APL->KC') aplOut[kIndex.get(e.target)] = e.synapses;
}
const ai = aplIn.reduce((a, b) => a + b, 0), ao = aplOut.reduce((a, b) => a + b, 0) / n;
for (let i = 0; i < n; i++) { aplIn[i] /= ai; aplOut[i] /= ao; }

export const MODEL = {
  version: 'malecns-mb-v1.0.0', dataset: 'male-cns:v1.0', sourceNeurons: circuit.nodes.length,
  spikingNeurons: pn.length + kc.length + 2, sourceEdges: circuit.edges.length,
  decisionEdges: edges.length + 2 * n, plasticEdges: 2 * n,
  pn: pn.length, kc: n, mbon: 2, dan: 17, apl: 1,
  graphHash: '68803bce9e136cdbdc07ecd50873044bab85ef931adbcdc0007ad127fd46cbcf',
  source: 'https://male-cns.janelia.org/', simulatedMs: 160,
  description: 'Selected real PN–KC–MBON wiring; modeled APL inhibition; engineered sensory encoding, action decoder and reward-modulated plasticity. Not a whole brain.',
};

export function random(b) {
  let x = b.rng | 0;
  x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
  b.rng = x >>> 0;
  return b.rng / 4294967296;
}

export function createBrain(seed = 1, { learning = true } = {}) {
  return { rng: (seed >>> 0) || 1, learning, gains: [Array(n).fill(0), Array(n).fill(0)],
    baseline: 0, decisions: 0, updates: 0, totalReward: 0 };
}

function cueChannels(context) {
  if (Array.isArray(context.cue)) return context.cue;
  const h = context.history || [];
  const last = h.at(-1), prev = h.at(-2);
  const agent = context.agent ?? 0, opponent = agent < 2 ? 1 - agent : 0;
  return [
    1, context.hunter === agent ? 1 : 0,
    last ? last.actions[opponent] : 0.5,
    last ? last.actions[agent < 2 ? agent : 1] : 0.5,
    last ? last.winner : 0.5,
    prev ? prev.actions[opponent] : 0.5,
    h.length ? h.slice(-8).filter(r => r.winner === 0).length / Math.min(h.length, 8) : 0.5,
    Number(context.hunter === 0),
  ];
}

export function decideBrain(brain, context = {}, options = {}) {
  const cues = cueChannels(context);
  const rates = pn.map((node, i) => {
    const channel = (Math.imul(node.bodyId, 2654435761) >>> 0) % cues.length;
    const value = i % 2 ? 1 - cues[channel] : cues[channel];
    return (options.baseRate ?? 8) + Math.max(0, Math.min(1, value)) * (options.rateGain ?? 65);
  });
  const v = new Float64Array(n), counts = new Uint16Array(n), refractory = new Uint8Array(n);
  const current = new Float64Array(n), mV = [0, 0], mCounts = [0, 0], mRef = [0, 0];
  const trace = { PN: [], KC: [], MBON07: [], MBON11: [], APL: [], hotIds: [] };
  let apl = 0, binPn = 0, binKc = 0;
  const gains = brain.gains.map((g, a) => Float64Array.from(g, (x, i) => base[a][i] * Math.exp(x)));
  for (let t = 0; t < 160; t++) {
    current.fill(0);
    for (let p = 0; p < pn.length; p++) {
      if (random(brain) < rates[p] / 1000) {
        binPn++;
        for (const [k, w] of pnTargets[p]) current[k] += w * (options.drive ?? 1.0);
      }
    }
    let weightedActivity = 0;
    const outputCurrent = [0, 0];
    for (let k = 0; k < n; k++) {
      if (refractory[k]) { refractory[k]--; continue; }
      v[k] = Math.max(0, v[k] * 0.9512 + current[k] - apl * aplOut[k] * 0.035);
      if (v[k] >= (options.threshold ?? 2.2)) {
        v[k] = 0; refractory[k] = 5; counts[k]++; binKc++;
        weightedActivity += aplIn[k];
        outputCurrent[0] += gains[0][k] / n * 18;
        outputCurrent[1] += gains[1][k] / n * 18;
      }
    }
    apl = apl * 0.9 + weightedActivity * 0.1;
    for (let a = 0; a < 2; a++) {
      if (mRef[a]) { mRef[a]--; continue; }
      mV[a] = mV[a] * 0.95 + outputCurrent[a];
      if (mV[a] >= 0.1) { mCounts[a]++; mV[a] = 0; mRef[a] = 8; }
    }
    if (t % 10 === 9) {
      trace.PN.push(Math.round(binPn * 100 / pn.length));
      trace.KC.push(Math.round(binKc * 100 / n));
      trace.MBON07.push(mCounts[0]); trace.MBON11.push(mCounts[1]);
      trace.APL.push(Number(apl.toFixed(4))); binPn = 0; binKc = 0;
    }
  }
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) throw new Error('No Kenyon activity for this stimulus');
  const features = Array.from(counts, x => x / Math.max(1 / n, total / n));
  // Smooth readout integrates the same measured KC activity over real KC→MBON edges.
  // This modeled rate decoder avoids coarse spike-count quantization at the two output cells.
  const logits = gains.map(g => { let value = 0; for (let k = 0; k < n; k++) value += features[k] * g[k]; return value / n; });
  const p0 = Math.max(0.04, Math.min(0.96, 1 / (1 + Math.exp((logits[1] - logits[0]) * 3))));
  const action = random(brain) < p0 ? 0 : 1;
  brain.decisions++;
  trace.hotIds = kc.map((node, i) => [node.bodyId, counts[i]]).sort((a, b) => b[1] - a[1]).slice(0, 32).filter(x => x[1] > 0).map(x => x[0]);
  return { action, probability: [p0, 1 - p0], features, trace, activeKCs: counts.filter(x => x > 0).length, simulatedMs: 160 };
}

export function reinforceBrain(brain, decision, reward) {
  const expected = brain.baseline;
  const delta = reward - expected;
  let changed = 0, magnitude = 0;
  if (brain.learning) {
    for (let a = 0; a < 2; a++) {
      const eligibility = (a === decision.action ? 1 : 0) - decision.probability[a];
      for (let k = 0; k < n; k++) {
        const old = brain.gains[a][k];
        const update = 0.065 * delta * eligibility * Math.min(4, decision.features[k]);
        const next = Math.max(-1.5, Math.min(1.5, old * 0.9995 + update));
        brain.gains[a][k] = next;
        if (Math.abs(next - old) > 1e-8) changed++;
        magnitude += Math.abs(next - old);
      }
    }
    brain.updates++;
  }
  brain.baseline = 0.95 * expected + 0.05 * reward;
  brain.totalReward += reward;
  return { reward, expected: Number(expected.toFixed(4)), delta: Number(delta.toFixed(4)), changedEdges: changed,
    meanChange: Number((magnitude / (2 * n)).toFixed(6)), learning: brain.learning,
    label: 'Modeled reward prediction error, not measured dopamine concentration' };
}

export function circuitForVisualization() {
  return {
    model: MODEL,
    nodes: circuit.nodes.map(n => ({ id: n.bodyId, role: n.role, type: n.type, position: n.somaVoxel })),
    edges: circuit.edges.filter((e, i) => i % 20 === 0).map(e => [e.source, e.target, e.role]),
  };
}
