// Read-only live verification. Run only against an arena you operate.
import { writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const base=process.argv[2]||'https://fly-circuit-arena.fly-circuit-arena.workers.dev';
const viewers=Math.max(2,Math.min(100,Number(process.argv[3])||20));
const startedAt=new Date().toISOString();
const before=await fetch(base+'/api/health').then(r=>r.json());
const expected=new Map(),clients=[],errors=[];
let messages=0;
function fingerprint(d){return createHash('sha256').update(JSON.stringify({revision:d.revision,phase:d.phase,match:d.match,currentRound:d.currentRound,stats:d.stats,feedback:d.feedback})).digest('hex');}
await Promise.all(Array.from({length:viewers},(_,i)=>new Promise((resolve,reject)=>{
 const ws=new WebSocket(base.replace(/^http/,'ws')+'/api/live');const c={ws,messages:0,revisions:[]};clients.push(c);
 const timer=setTimeout(()=>reject(new Error('Viewer handshake timed out')),15000);
 ws.addEventListener('message',e=>{if(e.data==='pong')return;try{const m=JSON.parse(e.data);if(m.type!=='state')return;const d=m.data,hash=fingerprint(d);if(expected.has(d.revision)&&expected.get(d.revision)!==hash)errors.push('Conflicting state at revision '+d.revision);expected.set(d.revision,hash);if(c.revisions.length&&d.revision<c.revisions.at(-1))errors.push('Revision went backwards');c.revisions.push(d.revision);c.messages++;messages++;if(c.messages===1){clearTimeout(timer);resolve();}}catch(e){reject(e);}});
 ws.addEventListener('error',()=>{clearTimeout(timer);reject(new Error('Viewer '+i+' connection failed'));});
}))).catch(e=>{for(const c of clients)c.ws.close();throw e;});
await new Promise(r=>setTimeout(r,32000));
for(const c of clients)c.ws.close(1000,'Smoke test complete');
const after=await fetch(base+'/api/health').then(r=>r.json());
const rounds=await fetch(base+'/api/rounds?limit=100').then(r=>r.json());
assert.equal(new Set(rounds.rounds.map(r=>r.id)).size,rounds.rounds.length);
assert.ok(after.ok&&after.revision>before.revision);
assert.equal(errors.length,0);
assert.ok(clients.every(c=>c.messages>1));
for(const r of rounds.rounds){assert.ok(r.predictionLockedAt<r.choicesLockedAt&&r.choicesLockedAt<r.revealedAt&&r.revealedAt<r.completedAt);assert.equal(r.winner,r.actions[0]===r.actions[1]?r.hunter:1-r.hunter);}
const report={startedAt,completedAt:new Date().toISOString(),base,viewers,messages,distinctRevisions:expected.size,before,after,errors,checkedRetainedRounds:rounds.rounds.length,status:'passed',limitation:'A short same-origin client smoke test, not a geographic latency study or 24-hour availability claim.'};
await mkdir('artifacts/validation',{recursive:true});await writeFile(`artifacts/validation/live-${viewers}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
