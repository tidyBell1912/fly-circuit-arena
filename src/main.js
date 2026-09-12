import { initLanguage, languageMenu, formatDate } from './i18n.js';
import './style.css';
import { createScene } from './scene.js';

const app = document.getElementById('app');
const route = location.pathname;
const isMethods = route === '/methods', isResults = route === '/results', replayId = route.match(/^\/match\/(\d+)$/)?.[1];
const names = ['Iris', 'Cobalt', 'Mica'];
const fmt = n => Number(n).toLocaleString('en-US');
const pct = n => Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—';
const pad = n => String(n).padStart(4, '0');
const sign = n => n > 0 ? `+${n}` : `${n}`;
let state = null, scene = null, serverOffset = 0, connected = false, reconnectDelay = 1000, ws = null;

const header = `<header class="topbar"><a class="brand" href="/"><span class="brand-mark">F<span>/</span>A</span><span>FLY CIRCUIT<span class="brand-secondary">ARENA</span></span></a><nav aria-label="Main"><a href="/" ${!isMethods && !isResults ? 'aria-current="page"' : ''}>Arena</a><a href="/methods" ${isMethods ? 'aria-current="page"' : ''}>Methods</a><a href="/results" ${isResults ? 'aria-current="page"' : ''}>Results</a><a href="https://github.com/tidyBell1912/fly-circuit-arena" target="_blank" rel="noreferrer">Source ↗</a></nav><span class="connection"><i id="connection-dot"></i><span id="connection-text">Connecting</span></span>${languageMenu()}</header>`;
const footer = `<footer><span>MaleCNS v1.0 · Selected circuit, modeled dynamics.</span><a href="/methods#credits">Data & anatomy credits</a><span>A strategic model experiment · Virtual points only.</span></footer>`;
const stages = [['predict', 'Predict'], ['think', 'Decide'], ['sealed', 'Seal'], ['reveal', 'Reveal'], ['feedback', 'Learn']];

function liveLayout() {
  return `<main class="live-layout"><section class="arena-column"><div class="arena-heading"><div><div class="eyebrow" id="experiment-label">ONE STEALS. ONE HUNTS. ONE BETS.</div><h1>${replayId ? `Match ${pad(replayId)}` : 'The sugar heist'}</h1></div><div class="match-counter"><span id="match-label">MATCH —</span><strong id="round-label">Waiting for the arena</strong></div></div><div class="arena-stage" id="arena-stage"><div class="stage-overlay"><span class="stage-badge" id="stage-badge">${replayId ? 'RECORDED MATCH' : 'LIVE / GLOBAL'}</span><span class="stage-note">Drag to orbit · Actions follow circuit choices</span></div><div class="heist-caption"><span id="heist-kicker">A GAME OF BLUFF & INTERCEPTION</span><strong id="heist-headline">Pick a vault. Read your rival.</strong><span id="heist-detail">Two choices. One sugar cube. No second chances.</span></div><div class="stage-result" id="stage-result" hidden></div><div class="stage-loading" id="stage-loading">Loading 3D anatomy<span>NeuroMechFly v2</span></div><div class="camera-switch" aria-label="Camera view"><button data-camera="cinematic" class="selected">Live camera</button><button data-camera="arena">Arena</button><button data-camera="focus">Close-up</button><button data-camera="circuit">Circuit</button></div><button class="record-button" id="record-clip" title="Save a 30-second video of the next real round">↓ Save a round</button><div class="circuit-note" id="circuit-note" hidden>Recorded soma positions · Straight lines show selected connections<br>Gold points: active Kenyon cells in Iris’s last revealed decision</div></div><div class="phase-panel"><div class="phase-head"><span id="phase-label">Connecting to the shared arena</span><strong id="countdown">—</strong></div><div class="phase-track">${stages.map(([id, label], i) => `<div data-phase="${id}"><span>0${i + 1}</span>${label}</div>`).join('')}</div><div class="phase-progress"><div id="phase-progress-fill"></div></div></div><div id="replay-controls" class="replay-controls" hidden></div><div class="scoreboard">${[0, 1].map(i => `<article class="contestant fly-${i}"><div><span class="small-label">CIRCUIT 0${i + 1} / <span id="role-${i}">—</span></span><h2>${names[i]}<span class="score" id="score-${i}">—</span></h2><div class="choice"><span>Target vault</span><strong id="choice-${i}">Sealed</strong></div></div><div class="mini-signal"><span>KC population activity · Hz</span><div id="trace-${i}" class="trace-empty">Waiting for a revealed decision</div></div><div class="reward-line"><span>Reward signal <b id="reward-${i}">—</b></span><span id="updated-${i}">No feedback yet</span></div></article>`).join('')}</div></section><aside class="observer"><div class="observer-heading"><span class="small-label">CIRCUIT 03 / OBSERVER</span><h2>Mica<span>the predictor</span></h2><p>One steals the sugar.<br>One hunts. Mica bets.</p></div><div class="prediction-card"><span class="small-label">THIS ROUND’S PICK</span><div id="prediction-pick">Waiting<span>1 virtual point per round</span></div><div class="prediction-status" id="prediction-status">Only completed history is visible to Mica.</div></div><div class="observer-stats"><div><span>Prediction accuracy</span><strong id="accuracy">—</strong></div><div><span>Net points</span><strong id="net-points">0</strong></div><div><span>Predictions</span><strong id="prediction-count">0</strong></div><div><span>Last 100</span><strong id="recent-accuracy">—</strong></div></div><div class="observer-feedback"><span class="small-label">MODELED REWARD FEEDBACK</span><div class="feedback-bar"><span id="mica-feedback-bar"></span></div><div><strong id="reward-2">—</strong><span id="updated-2">Awaiting the first outcome</span></div></div><div class="how-it-works"><span class="small-label">BLUFF. STEAL. INTERCEPT.</span><p>The thief picks a sugar vault. The hunter predicts the route. Same vault: caught. Different vaults: escape. Roles switch each match.</p><div><span>30s / round</span><span>5 rounds / match</span></div><a href="/methods">Read the experiment →</a></div><a class="replay-link" id="replay-link" href="/results">See completed matches ↗</a></aside><section class="bottom-panel"><div class="recent-heading"><h2>Recent rounds</h2><span id="total-rounds">No outcomes yet</span></div><div class="round-table-wrap"><table class="round-table"><thead><tr><th>Round</th><th>Iris</th><th>Cobalt</th><th>Winner</th><th>Mica’s pick</th><th>Prediction</th><th>Replay</th></tr></thead><tbody id="recent-rounds"><tr><td colspan="7" class="empty">The first result will appear after a complete round.</td></tr></tbody></table></div></section><div class="model-strip"><span><strong id="model-neurons">1,001</strong> sourced neurons</span><span><strong>3</strong> independent states</span><span><strong>1</strong> global arena</span><a href="/methods">What is real, and what is modeled ↗</a></div></main>`;
}

function methodsLayout() {
  return `<main class="article"><div class="article-kicker">PROTOCOL / V1.0</div><h1>Real wiring.<br>Explicit assumptions.</h1><p class="article-lead">A small, observable experiment in competition and prediction, built on a selected fruit-fly neural circuit.</p><a class="live-inline" href="/"><i></i><span id="inline-live">Connect to the shared live arena</span><b>Watch →</b></a><section><span class="section-number">01</span><h2>The experiment</h2><p>Iris and Cobalt play Sugar Heist, a visual version of the simultaneous two-door game (matching pennies). A thief chooses a sugar vault while a hunter predicts the route. Matching choices let the hunter intercept; different choices let the thief escape with sugar. Mica publicly locks a bet before the competitors reveal their routes. The competitors never receive that current bet as input. Every round uses one virtual point, with no deposits, payouts or cash value.</p><p>There are five 30-second rounds per match, plus a short introduction and recap. The two competitors swap roles next match. All three retain their learned parameters. Everyone watches the same server-authoritative sequence.</p></section><section><span class="section-number">02</span><h2>The biological source</h2><p>The source is <a href="https://male-cns.janelia.org/" target="_blank" rel="noreferrer">MaleCNS v1.0</a>, the adult male Drosophila brain and nerve-cord connectome. We query a specific left mushroom-body subgraph: 131 projection neurons, 850 Kenyon cells, two output neurons, one APL interneuron and 17 dopamine-associated neurons.</p><div class="method-numbers"><div><strong>1,001</strong><span>Source neurons</span></div><div><strong>11,845</strong><span>Recorded connections</span></div><div><strong>1,700</strong><span>Plastic KC → MBON edges</span></div></div><p>The two selected outputs are MBON07 (18603) and MBON11 (10704). We retain actual neuron IDs and structural synapse counts. Thirty-one of the selected Kenyon cells have no projection-neuron input in this extract; we do not invent missing connections.</p><p>This is a selected circuit, <strong>not a complete brain</strong>. The 17 dopamine-associated cells are anatomical context for the learning hypothesis; they are not a biophysical simulation of dopamine release. The three agents are independent model states initialized from the same specimen’s wiring.</p></section><section><span class="section-number">03</span><h2>From history to a decision</h2><div class="method-flow"><span>Public history</span><b>→</b><span>Modeled sensory input</span><b>→</b><span>PN / KC activity</span><b>→</b><span>Two output channels</span><b>→</b><span>A choice</span></div><p>Previous choices, role and recent outcomes are encoded into synthetic projection-neuron stimulation. A 160 ms neural episode uses Poisson input and leaky integrate-and-fire dynamics. Structural synapse counts determine normalized pathway weights; modeled APL feedback provides inhibition.</p><p>An engineered two-channel rate decoder integrates Kenyon activity over the real KC → MBON connections. A bounded stochastic policy chooses a door, or a predicted winner. The output neurons are not known biological “left door” and “right door” commands. No language model or chess engine supplies the actions.</p><p>The 30-second round is a viewing schedule, not a claim of 30 biological seconds of continuous neural computation. Body movement is illustrative choreography; it never determines the winner. Circuit-view points use recorded soma positions; connecting lines are schematic, not reconstructed neurites.</p></section><section><span class="section-number">04</span><h2>A reward signal that changes the model</h2><p>After each outcome, an engineered reward prediction error is calculated as actual reward minus an exponentially averaged expectation. This signal changes bounded gains on the existing KC → MBON edges, weighted by recent Kenyon activity and the selected action. Each agent owns its own gains, reward history and random state.</p><p>The interface reports the modeled error and the number of changed edges; body halos visualize these signals without claiming to show measured brain chemistry. These values are <strong>not measured dopamine concentrations, pleasure or consciousness</strong>. The rule is research-inspired rather than a validated reconstruction of receptor-specific plasticity.</p><p>Related work: <a href="https://www.nature.com/articles/s41586-024-07763-9" target="_blank" rel="noreferrer">Shiu et al., Nature (2024)</a> and <a href="https://www.nature.com/articles/s41467-021-22592-4" target="_blank" rel="noreferrer">Learning with reinforcement prediction errors, Nature Communications (2021)</a>.</p></section><section><span class="section-number">05</span><h2>What would count as learning?</h2><p>A changing weight is insufficient. We compare enabled and frozen plasticity on declared, reproducible tasks, including predictable opponents and changing contingencies. Random and shuffled-wiring controls separate effects of the update rule from effects of the recorded circuit.</p><p>In fair independent two-door play, the expected win rate is 50%. A predictor cannot reliably beat chance against genuinely unpredictable play. Live accuracy alone is therefore not evidence of biological intelligence. We publish measured results and limitations on the <a href="/results">results page</a>.</p></section><section><span class="section-number">06</span><h2>One global history</h2><p>A single Cloudflare Durable Object owns decisions and persistent learning state. Detailed replays retain the latest 1,001 matches; lifetime aggregate statistics persist. It stores each transition before broadcasting it. Mica receives only completed-round history. Spectators have read-only access; their browsers render the shared events rather than create separate matches.</p><p>Reconnects recover from a confirmed snapshot. Alarms advance the experiment without visitors. If computation or scheduling is delayed, the interface reports it; it does not fill gaps with invented results.</p></section><section id="credits"><span class="section-number">07</span><h2>Sources & credits</h2><ul><li>Connectome: HHMI Janelia FlyEM, Cambridge collaborators and Google Research. MaleCNS v1.0, CC BY 4.0.</li><li>3D anatomy: <a href="https://github.com/NeLy-EPFL/fly-svg-maker" target="_blank" rel="noreferrer">NeuroMechFly v2 / NeLy-EPFL</a>, Apache-2.0. Converted to glTF; neutral pose and joint structure retained.</li><li>Framework: Three.js, MIT. Forward-kinematics helper: NeLy-EPFL, MIT.</li></ul><p>See <a href="/assets/NOTICE">asset notice</a>, <a href="/assets/LICENSE-APACHE-2.0">anatomy license</a>, and the <a href="https://github.com/tidyBell1912/fly-circuit-arena" target="_blank" rel="noreferrer">source repository</a> for extraction queries, parameters and reproducible tests.</p></section></main>`;
}

function resultsLayout() {
  return `<main class="results-page"><div class="arena-heading"><div><div class="eyebrow">OBSERVATIONS / OPEN RECORD</div><h1>Results, with context.</h1></div><a class="button-link" href="/">Return to the live arena →</a></div><a class="live-inline" href="/"><i></i><span id="inline-live">Connecting to the shared experiment</span><b>Watch →</b></a><section class="results-summary"><div><span>Completed rounds</span><strong id="results-rounds">—</strong></div><div><span>Completed matches</span><strong id="results-matches">—</strong></div><div><span>Mica’s accuracy</span><strong id="results-accuracy">—</strong></div><div><span>Net virtual points</span><strong id="results-net">—</strong></div></section><section class="experiment-section"><div class="recent-heading"><h2>Controlled experiments</h2><span>Reproducible · Separate from live play</span></div><div id="experiment-results"><p class="empty">Loading the published experimental report…</p></div></section><section class="bottom-panel"><div class="recent-heading"><h2>Completed matches</h2><span>Every result has a replay</span></div><div class="round-table-wrap"><table class="round-table"><thead><tr><th>Match</th><th>Completed</th><th>Iris</th><th>Cobalt</th><th>Winner</th><th>Replay</th></tr></thead><tbody id="match-list"><tr><td colspan="6" class="empty">Waiting for completed matches.</td></tr></tbody></table></div></section><p class="results-caveat">These are model results. A win, a reward signal or a changing connection does not establish learning in a living fly. <a href="/methods">Read the assumptions and controls.</a></p></main>`;
}

app.innerHTML = header + (isMethods ? methodsLayout() : isResults ? resultsLayout() : liveLayout()) + footer;
initLanguage();
function text(id, value) { const el = document.getElementById(id); if (el) el.textContent = value; }
function sparkline(values, color) {
  if (!values?.length) return '';
  const max = Math.max(1, ...values); const points = values.map((v, i) => `${i * 240 / (values.length - 1)},${38 - v / max * 31}`).join(' ');
  return `<svg viewBox="0 0 240 42" role="img" aria-label="Recorded Kenyon cell population firing rate over 160 milliseconds"><path d="M0 39H240" stroke="#263648" stroke-width="1"/><polyline fill="none" stroke="${color}" stroke-width="1.6" points="${points}"/></svg>`;
}
function roundRows(rounds) {
  return rounds.map(r => `<tr><td>#${pad(r.matchId)}.${r.number}</td><td>${r.actions[0] ? 'Right' : 'Left'}</td><td>${r.actions[1] ? 'Right' : 'Left'}</td><td class="fly-${r.winner}">${names[r.winner]}</td><td>${names[r.prediction]}</td><td class="${r.correct ? 'hit' : 'miss'}">${r.correct ? 'Correct +1' : 'Miss −1'}</td><td><a href="/match/${r.matchId}?round=${r.number}" aria-label="Replay match ${r.matchId} round ${r.number}">View ↗</a></td></tr>`).join('');
}
function render(next) {
  if (!replayId && state && next.revision < state.revision) return;
  state = next; serverOffset = next.serverTime - Date.now();
  app.dataset.revision = String(next.revision); app.dataset.match = String(next.match.id);
  text('inline-live', `Match ${pad(next.match.id)} · Round ${next.match.round} of 5 · ${next.phaseLabel}`);
  text('match-label', `MATCH ${pad(next.match.id)}`); text('round-label', `Round ${next.match.round} / 5`);
  text('phase-label', next.error || (next.delayed && !replayId ? 'Schedule delayed · preserving the last confirmed result' : next.phaseLabel));
  document.querySelectorAll('[data-phase]').forEach(el => el.classList.toggle('active', el.dataset.phase === next.phase));
  for (let i = 0; i < 2; i++) {
    text(`role-${i}`, next.match.hunter === i ? 'HUNTER' : 'THIEF'); text(`score-${i}`, next.match.score[i]);
    text(`choice-${i}`, next.currentRound ? (next.currentRound.actions[i] ? 'Right' : 'Left') : next.phase === 'recap' ? 'Match complete' : 'Sealed');
    const d = next.lastRound?.decisions?.[i];
    const trace = document.getElementById(`trace-${i}`);
    if (trace && d) { trace.innerHTML = sparkline(d.trace.KC, i ? '#69cfff' : '#ff957a'); trace.classList.remove('trace-empty'); }
  }
  next.feedback?.forEach((f, i) => {
    if (!f) return;
    text(`reward-${i}`, `${f.delta >= 0 ? '+' : ''}${f.delta.toFixed(2)}`);
    text(`updated-${i}`, `${fmt(f.changedEdges)} edges updated`);
    if (i === 2) { const bar = document.getElementById('mica-feedback-bar'); if (bar) { bar.style.width = `${Math.min(50, Math.abs(f.delta) / 2 * 50)}%`; bar.style.left = f.delta >= 0 ? '50%' : `${50 - Math.min(50, Math.abs(f.delta) / 2 * 50)}%`; bar.classList.toggle('negative', f.delta < 0); } }
  });
  const accuracy = next.stats.predictions ? next.stats.correct / next.stats.predictions : null;
  text('accuracy', pct(accuracy)); text('net-points', sign(next.stats.net)); text('prediction-count', fmt(next.stats.predictions)); text('recent-accuracy', pct(next.recentAccuracy));
  const pick = document.getElementById('prediction-pick');
  if (pick) {
    const shown = next.currentRound;
    pick.innerHTML = shown ? `${names[shown.prediction]}<span>1 virtual point · ${shown.correct ? 'Correct prediction' : 'Prediction missed'}</span>` : `${next.lockedPrediction ? names[next.lockedPrediction.agent] : 'Observing'}<span>${next.lockedPrediction ? 'Bet locked · 1 virtual point' : '1 virtual point per round'}</span>`;
    text('prediction-status', shown ? `Outcome: ${names[shown.winner]} wins this round.` : next.predictionLocked ? 'Bet locked. The competitors cannot see this pick.' : 'Only completed history is visible to Mica.');
  }
  text('total-rounds', `${fmt(next.stats.rounds)} rounds completed`);
  text('results-rounds', fmt(next.stats.rounds)); text('results-matches', fmt(next.stats.matches)); text('results-accuracy', pct(accuracy)); text('results-net', sign(next.stats.net));
  scene?.update(next);
  updateHeist();
  updateClock();
}

function updateHeist() {
  if (!state) return;
  const elapsed = replayId ? 10 : Math.max(0, (Date.now()+serverOffset-state.phaseStart)/1000);
  const r=state.currentRound;
  const hunter=names[state.match.hunter], thief=names[1-state.match.hunter];
  let headline, detail, kicker="A GAME OF BLUFF & INTERCEPTION";
  if(state.phase==="intro") { headline=`${thief} steals. ${hunter} hunts.`; detail="Five rounds. Read a rival. Win the heist."; }
  else if(state.phase==="predict") {headline="Mica, place your bet.";detail="One point. One prediction. Locked before the chase.";}
  else if(state.phase==="think") {headline="Which vault will they choose?";detail=`${thief} picks a route. ${hunter} predicts the ambush.`;}
  else if(state.phase==="sealed") {headline="Routes locked.";detail="No more changes. The heist begins.";}
  else if(state.phase==="reveal" && elapsed<6) {headline="The heist is on.";detail="Follow the trails. Same vault means interception.";}
  else if(r) {headline=r.winner===state.match.hunter?"INTERCEPTED!":"SUGAR STOLEN!"; detail=`${names[r.winner]} wins · Mica ${r.correct?"called it. +1 point":"missed. −1 point"}`;kicker=state.phase==="feedback"?"REWARD SIGNALS UPDATE ALL THREE CIRCUITS":"THE ROUTES DECIDED THE RESULT";}
  else if(state.phase==="recap") {headline=`${names[state.match.winner]} wins the match.`;detail=`${state.match.score.join(" : ")} · Roles reverse. Learned state stays.`;}
  text("heist-kicker",kicker);text("heist-headline",headline);text("heist-detail",detail);
}
function updateClock() {
  if (!state) return;
  updateHeist();
  const remaining = Math.max(0, state.deadline - (Date.now() + serverOffset));
  text('countdown', replayId ? 'REPLAY' : `${Math.ceil(remaining / 1000)}s`);
  const bar = document.getElementById('phase-progress-fill');
  if (bar) bar.style.width = `${Math.min(100, (1 - remaining / (state.deadline - state.phaseStart)) * 100)}%`;
}
setInterval(updateClock, 200);

function connection(status) {
  connected = status; text('connection-text', replayId ? 'Replay' : status ? 'Live · shared globally' : 'Reconnecting');
  document.getElementById('connection-dot')?.classList.toggle('online', status);
}
function connect() {
  if (replayId) return;
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/api/live`);
  ws.onopen = () => { reconnectDelay = 1000; connection(true); };
  ws.onmessage = e => {
    if (e.data === 'pong') return;
    try { const msg = JSON.parse(e.data); if (msg.type === 'state') { const changed = !state || msg.data.stats.rounds !== state.stats.rounds; render(msg.data); if (changed) refreshHistory(); } } catch { text('phase-label', 'Waiting for a confirmed arena update'); }
  };
  ws.onclose = () => { connection(false); setTimeout(connect, reconnectDelay + Math.random() * 700); reconnectDelay = Math.min(30000, reconnectDelay * 1.6); };
  ws.onerror = () => ws.close();
}
setInterval(() => { if (ws?.readyState === 1) ws.send('ping'); }, 45000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && ws?.readyState === 1) ws.send('snapshot'); });

async function refreshHistory() {
  try {
    if (document.getElementById('recent-rounds')) { const r = await fetch('/api/rounds?limit=8').then(r => r.json()); if (r.rounds.length) document.getElementById('recent-rounds').innerHTML = roundRows(r.rounds); }
    if (isResults) {
      const r = await fetch('/api/matches').then(r => r.json());
      if (r.matches.length) document.getElementById('match-list').innerHTML = r.matches.map(m => `<tr><td>#${pad(m.id)}</td><td>${formatDate(m.completedAt)}</td><td>${m.score[0]}</td><td>${m.score[1]}</td><td class="fly-${m.winner}">${names[m.winner]}</td><td><a href="/match/${m.id}">Replay ↗</a></td></tr>`).join('');
    }
  } catch { /* The live connection remains authoritative; history can be retried on the next event. */ }
}

if (!isMethods && !isResults) {
  createScene(document.getElementById('arena-stage'), () => document.getElementById('stage-loading')?.remove()).then(s => { scene = s; if (state) scene.update(state); }).catch(() => { text('stage-loading', '3D view unavailable. All live results remain available below.'); });
  document.getElementById('record-clip')?.addEventListener('click', async e => { if(!scene)return;const b=e.currentTarget;b.disabled=true;try{const clip=await scene.record(status=>{b.textContent=status;});const url=URL.createObjectURL(clip),a=document.createElement('a');a.href=url;a.download=`fly-heist-match-${state?.match.id||'live'}.webm`;a.click();b.textContent='Clip saved';setTimeout(()=>URL.revokeObjectURL(url),60000);}catch{b.textContent='Recording unavailable';}b.disabled=false; });
  document.querySelectorAll('[data-camera]').forEach(button => button.addEventListener('click', () => {
    document.querySelectorAll('[data-camera]').forEach(b => b.classList.toggle('selected', b === button));
    scene?.setMode(button.dataset.camera); document.querySelector(".heist-caption").hidden = button.dataset.camera === "circuit"; document.getElementById('circuit-note').hidden = button.dataset.camera !== 'circuit';
  }));
}

if (replayId) {
  connection(false);
  fetch(`/api/matches/${replayId}`).then(async r => { if (!r.ok) throw new Error('Match not found'); return r.json(); }).then(({ match, model }) => {
    const controls = document.getElementById('replay-controls'); controls.hidden = false;
    if (!match.rounds.length) { text('phase-label', 'This match has no completed rounds yet.'); return; }
    controls.innerHTML = `<span>Replay round</span>${match.rounds.map(r => `<button data-round="${r.number}">${r.number}</button>`).join('')}<a href="/">Back to live →</a>`;
    const show = number => {
      const r = match.rounds.find(r => r.number === number) || match.rounds[0];
      const score = [0, 0]; match.rounds.filter(x => x.number <= r.number).forEach(x => score[x.winner]++);
      render({ serverTime: Date.now(), revision: r.number, phase: 'feedback', phaseLabel: `Recorded ${formatDate(r.completedAt)}`, phaseStart: Date.now(), deadline: Date.now() + 6000, model, match: { ...match, score, round: r.number }, currentRound: r, lastRound: r, predictionLocked: true, feedback: r.feedback,
        stats: { rounds: match.rounds.length, matches: Number(!!match.completedAt), predictions: match.rounds.length, correct: match.rounds.filter(r => r.correct).length, net: match.rounds.reduce((v, r) => v + (r.correct ? 1 : -1), 0) }, recentAccuracy: match.rounds.filter(r => r.correct).length / match.rounds.length });
      document.getElementById('recent-rounds').innerHTML = roundRows([...match.rounds].reverse());
      controls.querySelectorAll('button').forEach(b => b.classList.toggle('selected', +b.dataset.round === r.number));
    };
    controls.querySelectorAll('button').forEach(b => b.addEventListener('click', () => show(+b.dataset.round)));
    show(Number(new URLSearchParams(location.search).get('round')) || 1);
    text('experiment-label', 'RECORDED / INSPECTABLE'); text('connection-text', 'Recorded replay');
  }).catch(() => text('phase-label', 'Match unavailable. Return to the live arena or choose a completed match.'));
} else {
  fetch('/api/state').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(render).catch(() => text('phase-label', 'The shared arena is temporarily unavailable. Reconnecting…'));
  connect(); refreshHistory();
}

if (isResults) {
  fetch('/results/experiments.json').then(r => { if (!r.ok) throw new Error(); return r.json(); }).then(report => {
    document.getElementById('experiment-results').innerHTML = `<p class="experiment-intro">${report.description}</p><div class="round-table-wrap"><table class="round-table"><thead><tr><th>Condition</th><th>Learning</th><th>Frozen</th><th>Runs</th></tr></thead><tbody>${report.conditions.map(c => `<tr><td>${c.label}</td><td>${pct(c.learning.mean)} <span class="subtle">± ${(c.learning.sd * 100).toFixed(1)} pp</span></td><td>${pct(c.frozen.mean)} <span class="subtle">± ${(c.frozen.sd * 100).toFixed(1)} pp</span></td><td>${c.runs}</td></tr>`).join('')}</tbody></table></div><p class="experiment-note">Mean ± standard deviation across independent runs. Zero failures across 256,000 decisions. After rule reversal, performance initially fell to 22.15% over the first 100 rounds; recovery was gradual. The shuffled circuit also learned, so these tests do not establish an advantage of specific biological wiring. ${report.limitation}</p><a class="download-report" href="/results/experiments.json" download>Download the full report ↓</a>`;
  }).catch(() => { text('experiment-results', 'The controlled study has not yet been published. Live play above is not a learning validation.'); });
}
