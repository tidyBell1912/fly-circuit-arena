import { readFile,writeFile,mkdir } from 'node:fs/promises';
const base='https://fly-circuit-arena.fly-circuit-arena.workers.dev';
const path='artifacts/validation/soak-start.json';
const health=await fetch(base+'/api/health').then(r=>r.json());
await mkdir('artifacts/validation',{recursive:true});
if(process.argv.includes('--start')){
 await writeFile(path,JSON.stringify({...health,checkedAt:new Date().toISOString(),baselineMatchId:health.matches+1},null,2));
 console.log('Saved an actual live baseline.');
}else{
 const baseline=JSON.parse(await readFile(path,'utf8')),elapsedHours=(Date.now()-Date.parse(baseline.checkedAt))/3600000;
 const ids=Array.from({length:Math.max(0,health.matches-baseline.baselineMatchId+1)},(_,i)=>baseline.baselineMatchId+i);
 const matches=[],failures=[];
 for(let i=0;i<ids.length;i+=8)await Promise.all(ids.slice(i,i+8).map(async id=>{const r=await fetch(base+'/api/matches/'+id);if(!r.ok){failures.push('Missing match '+id);return;}matches.push((await r.json()).match);}));
 matches.sort((a,b)=>a.id-b.id);const seen=new Set(),rounds=matches.flatMap(m=>m.rounds),gaps=[];
 for(const m of matches){if(m.rounds.length!==5||m.score[0]+m.score[1]!==5||m.score[0]===m.score[1])failures.push('Invalid five-round match '+m.id);}
 for(const r of rounds){if(seen.has(r.id))failures.push('Duplicate round '+r.id);seen.add(r.id);if(!(r.predictionLockedAt<r.choicesLockedAt&&r.choicesLockedAt<r.revealedAt&&r.revealedAt<r.completedAt))failures.push('Invalid decision ordering '+r.id);if(r.winner!==(r.actions[0]===r.actions[1]?r.hunter:1-r.hunter))failures.push('Wrong winner '+r.id);const delay=r.completedAt-r.startedAt-24000;if(delay>2500)gaps.push({round:r.id,extraMs:delay});}
 const report={checkedAt:new Date().toISOString(),baseline,health,elapsedHours,checkedMatches:matches.length,checkedRounds:rounds.length,failures,schedulingGaps:gaps,status:elapsedHours<24?'in-progress':failures.length||!health.ok?'needs-attention':'passed',limitation:'Audit of stored outcomes and observed timestamps; not an external continuous reachability measurement.'};
 await writeFile('artifacts/validation/soak-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,elapsedHours,checkedMatches:matches.length,checkedRounds:rounds.length,failures,gaps:gaps.length}));
}
