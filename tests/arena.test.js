import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createBrain, decideBrain, reinforceBrain, MODEL } from '../src/brain.js';
import { createArena, advanceArena, publicArena, DURATIONS } from '../src/arena.js';

test('published graph is exactly the source used by the model', () => {
  const bytes = readFileSync(new URL('../data/circuit.json', import.meta.url));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), MODEL.graphHash);
  const graph = JSON.parse(bytes);
  assert.equal(graph.nodes.length, 1001);
  assert.equal(graph.edges.length, 11845);
  const known = new Set(graph.nodes.map(n => n.bodyId));
  assert.ok(graph.edges.every(e => known.has(e.source) && known.has(e.target) && e.synapses > 0));
  assert.ok(graph.nodes.filter(n => n.role === 'KC').every(n => n.consensusNt === 'acetylcholine'));
});

test('30-second rounds, persistent independent learning and five-round winner', () => {
  assert.equal(['predict','think','sealed','reveal','feedback'].reduce((n,k)=>n+DURATIONS[k],0), 30000);
  const a = createArena(0, 3123);
  while (a.phase !== 'recap') {
    const before = a.deadline;
    assert.equal(advanceArena(a, before - 1), null);
    advanceArena(a, before);
  }
  assert.equal(a.deadline, 180000);
  assert.equal(a.stats.rounds, 5);
  assert.equal(a.stats.matches, 1);
  assert.equal(a.match.score.reduce((x,y)=>x+y), 5);
  assert.notEqual(a.match.score[0], a.match.score[1]);
  assert.deepEqual(a.brains.map(b => b.updates), [5,5,5]);
  assert.notDeepEqual(a.brains[0].gains, a.brains[1].gains);
  const learned = structuredClone(a.brains);
  advanceArena(a, a.deadline);
  assert.equal(a.match.hunter, 1);
  assert.deepEqual(a.brains, learned);
});

test('checkpoint restore gives identical future outcomes and no private state leaks', () => {
  const a = createArena(0, 99812);
  for(let i=0;i<3;i++) advanceArena(a,a.deadline);
  assert.equal(a.phase,'sealed');
  const publicData=publicArena(a,a.phaseStart);
  assert.equal(publicData.currentRound,null);
  assert.equal(publicData.lastRound,null);
  assert.doesNotMatch(JSON.stringify(publicData), /"(rng|gains|features|pending|probability|actions)":/);
  const restored=JSON.parse(JSON.stringify(a));
  for(let i=0;i<14;i++) {
    assert.deepEqual(advanceArena(a,a.deadline),advanceArena(restored,restored.deadline));
    assert.deepEqual(a,restored);
  }
});

test('reward changes enabled gains, frozen controls stay frozen, no agent aliasing', () => {
  const a=createBrain(19), frozen=createBrain(19,{learning:false}), unrelated=createBrain(19);
  const d=decideBrain(a,{cue:[0,1]}), f=decideBrain(frozen,{cue:[0,1]});
  assert.deepEqual(d,f);
  assert.ok(reinforceBrain(a,d,1).changedEdges>0);
  assert.equal(reinforceBrain(frozen,f,1).changedEdges,0);
  assert.ok(frozen.gains.flat().every(x=>x===0));
  assert.ok(unrelated.gains.flat().every(x=>x===0));
});

test('a delayed alarm advances one phase, preserving a visible gap', () => {
  const a=createArena(0,5);
  advanceArena(a,1000000);
  assert.equal(a.revision,1);
  assert.equal(a.stats.rounds,0);
  assert.equal(a.deadline,1004000);
  assert.equal(publicArena(a,1000000).delayed,true);
});
