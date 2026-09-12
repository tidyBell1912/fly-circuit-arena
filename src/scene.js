import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { neutralPoseRad, segmentTransforms } from './fly-fk.js';

const COLORS=[0xff8b70,0x69d6ff,0xffd56e],NAMES=['IRIS','COBALT','MICA'];
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
const V=(x=0,y=0,z=0)=>new THREE.Vector3(x,y,z);

export async function createScene(container,onLoad){
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x0a1320);scene.fog=new THREE.FogExp2(0x0a1320,.012);
  const camera=new THREE.PerspectiveCamera(39,1,.1,130);camera.position.set(0,16,22);
  const renderer=new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  container.prepend(renderer.domElement);renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','3D Sugar Heist: two fruit flies bluff, race to sugar vaults and intercept or escape. Mica watches and bets.');
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.enablePan=false;controls.minDistance=7;controls.maxDistance=38;controls.maxPolarAngle=Math.PI*.48;controls.target.set(0,.5,-.2);
  let sceneTop=110;
  let state=null,mode='cinematic',manual=false,disposed=false,raf=0,lastFK=0,offset=0,recording=null;
  controls.addEventListener('start',()=>{manual=true;});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  const world=new THREE.Group();scene.add(world);
  scene.add(new THREE.HemisphereLight(0xcfeeff,0x16203b,2.2));
  const key=new THREE.DirectionalLight(0xffedda,3.5);key.position.set(-8,16,9);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-14,right:14,top:14,bottom:-14});key.shadow.normalBias=.04;scene.add(key);
  const rim=new THREE.DirectionalLight(0x80b8ff,2.5);rim.position.set(8,9,-12);scene.add(rim);
  const mat=(color,extra={})=>new THREE.MeshStandardMaterial({color,roughness:.5,metalness:.2,...extra});
  function mesh(geo,material,x=0,y=0,z=0,parent=world){const m=new THREE.Mesh(geo,material);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;}
  function ring(radius,color,x,y,z,tube=.025,parent=world){const r=mesh(new THREE.TorusGeometry(radius,tube,8,80),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8}),x,y,z,parent);r.rotation.x=-Math.PI/2;return r;}
  mesh(new THREE.CylinderGeometry(10.8,11.1,.5,96),mat(0x17314a,{roughness:.6}),0,-.4,0);
  ring(10.75,0x4c89b6,0,-.12,0,.035);ring(10,0x375d76,0,-.11,0,.015);
  for(let i=0;i<72;i++){const a=i*Math.PI/36;const m=mesh(new THREE.BoxGeometry(i%6?.045:.08,.014,i%6?.2:.4),mat(0x5683a0),Math.cos(a)*10.35,-.13,Math.sin(a)*10.35);m.rotation.y=-a+Math.PI/2;}
  for(const side of [-1,1]){mesh(new THREE.BoxGeometry(.035,.02,12),new THREE.MeshBasicMaterial({color:0x365978}),side*5,-.12,0);for(let z=-6;z<6;z+=1.4)mesh(new THREE.BoxGeometry(.45,.025,.035),mat(0x476c87),side*5,-.1,z);}
  const vaults=[-5,5].map((x,i)=>{
    const g=new THREE.Group();g.position.set(x,0,-4.5);world.add(g);mesh(new THREE.CylinderGeometry(1.9,2.05,.32,64),mat(0x28465c),0,.02,0,g);ring(1.9,i?0x75ddff:0xffd987,0,.21,0,.055,g);
    const frame=mesh(new THREE.TorusGeometry(1.6,.085,12,64),mat(i?0x8edfff:0xffd78d,{emissive:i?0x2b718b:0x846126,emissiveIntensity:.5}),0,1.6,-.55,g);
    const shield=mesh(new THREE.CircleGeometry(1.5,64),new THREE.MeshBasicMaterial({color:i?0x78dfff:0xffcf77,transparent:true,opacity:.13,side:THREE.DoubleSide}),0,1.6,-.53,g);
    const sugar=new THREE.Group();g.add(sugar);sugar.position.set(0,1.2,.15);for(const [dx,dy,dz]of [[0,0,0],[.38,.45,.05],[-.35,.25,-.15]])mesh(new THREE.BoxGeometry(.62,.62,.62),mat(0xffedba,{emissive:0xd89726,emissiveIntensity:.55,roughness:.8}),dx,dy,dz,sugar);
    return {g,frame,shield,sugar};
  });
  const starts=[V(-4,.2,4.6),V(4,.2,4.6),V(0,1.3,-7.3)];
  mesh(new THREE.CylinderGeometry(2,2.15,.85,64),mat(0x3a3940),0,.3,-7.3);ring(1.95,COLORS[2],0,.75,-7.3,.045);
  const holders=starts.map((p,i)=>{if(i<2)ring(1.7,COLORS[i],p.x,-.05,p.z,.035);const g=new THREE.Group();g.position.copy(p);world.add(g);return g;});
  const halos=starts.map((p,i)=>ring(i===2?1.35:1.65,COLORS[i],p.x,.15,p.z,.04));
  const brainHalos=holders.map((h,i)=>{const r=ring(.95,COLORS[i],0,2,0,.025,h);r.material.opacity=0;return r;});
  const carry=holders.map(h=>{const g=new THREE.Group();g.position.set(-.8,1.3,0);h.add(g);mesh(new THREE.BoxGeometry(.65,.65,.65),mat(0xffdfa1,{emissive:0xc98b22,emissiveIntensity:.5}),0,0,0,g);g.visible=false;return g;});
  const betToken=mesh(new THREE.CylinderGeometry(.42,.42,.13,32),mat(COLORS[2],{metalness:.7,emissive:0x826112,emissiveIntensity:.5}),0,3,-7.3);betToken.rotation.x=Math.PI/2;
  const shock=ring(.7,0xffe6a4,0,.3,0,.065);shock.visible=false;
  const trails=COLORS.slice(0,2).map(color=>{const l=new THREE.Line(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color,transparent:true,opacity:.7}));world.add(l);return l;});
  const particles=new Float32Array(64*3),particleGeo=new THREE.BufferGeometry().setAttribute('position',new THREE.BufferAttribute(particles,3));
  const confetti=new THREE.Points(particleGeo,new THREE.PointsMaterial({color:0xffd783,size:.095,transparent:true,opacity:.85}));world.add(confetti);confetti.visible=false;
  function label(content,className,point){const el=document.createElement('div');el.className=className;el.innerHTML=content;container.append(el);return {el,point};}
  const labels=starts.map((p,i)=>label(`<span>0${i+1}</span>${NAMES[i]}`,`scene-label fly-${i}`,p.clone()));
  const vaultLabels=vaults.map((v,i)=>label(`${i?'RIGHT':'LEFT'} VAULT`,'gate-label',v.g.position.clone().add(V(0,3.8,0))));
  const [gltf,rig,graph,walk,run,flightPose]=await Promise.all([new GLTFLoader().loadAsync('/assets/neuromechfly.glb'),fetch('/assets/fly-rig.json').then(r=>r.json()),fetch('/data/circuit-view.json').then(r=>r.json()),fetch('/assets/walk-gait.json').then(r=>r.json()),fetch('/assets/run-gait.json').then(r=>r.json()),fetch('/assets/flight-pose.json').then(r=>r.json())]);
  const neutral={...neutralPoseRad(rig),...walk.standingPose};
  const flies=holders.map((h,i)=>{const fly=gltf.scene.clone(true);fly.scale.setScalar(i===2?.65:.78);h.add(fly);const segments=new Map();fly.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}if(rig.segments.includes(o.name))segments.set(o.name,o);});return {segments,pose:{...neutral}};});
  const cloud=new THREE.Group();cloud.visible=false;scene.add(cloud);
  const valid=graph.nodes.filter(n=>n.position),bounds=new THREE.Box3().setFromPoints(valid.map(n=>V(...n.position))),center=bounds.getCenter(V()),size=bounds.getSize(V()),scale=15/Math.max(size.x,size.y,size.z);
  const coord=p=>V((p[0]-center.x)*scale,-(p[2]-center.z)*scale+3,(p[1]-center.y)*scale);
  const pos=[],cols=[],nodeMap=new Map(),roleColors={PN:0x7bd8d1,KC:0x8fb6da,MBON:0xff9d7c,DAN:0xe4ce81,APL:0xfff0cb};
  valid.forEach(n=>{const p=coord(n.position);pos.push(...p.toArray());nodeMap.set(n.id,p);cols.push(...new THREE.Color(roleColors[n.role]).toArray());});
  cloud.add(new THREE.Points(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(pos,3)).setAttribute('color',new THREE.Float32BufferAttribute(cols,3)),new THREE.PointsMaterial({size:.09,vertexColors:true})));
  const linePos=[];for(const e of graph.edges)if(nodeMap.has(e[0])&&nodeMap.has(e[1]))linePos.push(...nodeMap.get(e[0]).toArray(),...nodeMap.get(e[1]).toArray());
  cloud.add(new THREE.LineSegments(new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(linePos,3)),new THREE.LineBasicMaterial({color:0x40668b,transparent:true,opacity:.2})));
  const hotGeo=new THREE.BufferGeometry(),hot=new THREE.Points(hotGeo,new THREE.PointsMaterial({size:.19,color:0xffd585,transparent:true,opacity:.9}));cloud.add(hot);
  const born=performance.now();
  const resize=()=>{sceneTop=container.clientWidth<500?125:100;const h=container.clientHeight-sceneTop;renderer.setSize(container.clientWidth,h);renderer.domElement.style.position='absolute';renderer.domElement.style.top=sceneTop+'px';camera.aspect=container.clientWidth/h;camera.updateProjectionMatrix();};const ro=new ResizeObserver(resize);ro.observe(container);resize();
  function routePosition(i,action,u){const start=starts[i],end=V(action?5:-5,.28,-3.9),bend=V(i?7:-7,.22,1);return new THREE.QuadraticBezierCurve3(start,bend,end.clone().add(V(i?.6:-.6,0,.35))).getPoint(clamp(u));}
  function samplePose(i,elapsed,t){
    const r=state?.currentRound,hunter=state?.match.hunter??0;let p=starts[i].clone(),target=p.clone().add(V(0,0,-1)),speed=.25,flight=0;
    if(i===2){p.y+=Math.sin(t*2)*.09;target=V(0,1,0);return {p,target,speed:.2,flight:0};}
    if(r&&['reveal','feedback'].includes(state.phase)){
      const e=state.phase==='feedback'?12+elapsed:elapsed,u=smooth(e/5);p=routePosition(i,r.actions[i],u);target=routePosition(i,r.actions[i],Math.min(1,u+.035));speed=e<5?6:1.2;
      if(e>=5){const a=(e-5)*(i===hunter?2.4:2)+i*Math.PI;
        if(r.actions[0]===r.actions[1]){const c=V(r.actions[i]?5:-5,.35,-3.6),rad=e<8?1.15-.7*(e-5)/3:.45;p=c.clone().add(V(Math.cos(a)*rad,0,Math.sin(a)*rad));target=c.clone().add(V(Math.cos(a+.15)*rad,0,Math.sin(a+.15)*rad));speed=e<8?7:1;}
        else if(i!==hunter){const f=smooth((e-5)/4);p.lerpVectors(V(r.actions[i]?5:-5,.35,-3.6),V(0,2.3,1.2),f);p.y+=Math.sin(clamp((e-5)/4)*Math.PI)*1.1;target=V(0,2.3,2.2);flight=f>.05?1:0;speed=2;}
        else{p.add(V(Math.sin(a)*.55,0,Math.cos(a)*.55));target=p.clone().add(V(Math.cos(a),0,-Math.sin(a)));speed=2;}
        if(e>8&&r.actions[0]===r.actions[1]&&i!==r.winner){p.x+=(i?1:-1)*2.2;p.z+=1.6;target=p.clone().add(V(0,0,1));}
        if(e>8&&i===r.winner){p.y+=.22+Math.abs(Math.sin((e-8)*3))*.45;flight=.6;speed=2;}
      }carry[i].visible=e>5&&i===(e>8?r.winner:1-hunter);
    }else{const phase=state?.phase,amp=phase==='think'?.7:phase==='sealed'?.06:.45;p.x+=Math.sin(t*.95+i*2)*amp;p.z+=Math.cos(t*.8+i*2)*amp*.7;target=V(Math.sin(t*.6+i)*4,.2,-4.5);speed=phase==='think'?2.5:.75;if(phase==='sealed'){p.y+=Math.sin(t*14)*.025;speed=0;}carry[i].visible=false;}
    return {p,target,speed,flight};
  }
  function animate(){
    if(disposed)return;raf=requestAnimationFrame(animate);const t=(performance.now()-born)/1000,elapsed=state?Math.max(0,(Date.now()+offset-state.phaseStart)/1000):0;
    const r=state?.currentRound,revealing=!!r&&['reveal','feedback'].includes(state.phase),e=state?.phase==='feedback'?12+elapsed:elapsed;
    for(let i=0;i<3;i++){
      const a=samplePose(i,elapsed,t),h=holders[i];h.position.copy(a.p);const d=a.target.clone().sub(a.p);if(d.length()>.03)h.rotation.y=Math.atan2(-d.z,d.x);
      halos[i].position.set(a.p.x,.2,a.p.z);halos[i].material.opacity=revealing&&r.winner===i?.85:.35;halos[i].scale.setScalar(revealing&&e>8&&r.winner===i?1+Math.sin(t*4)*.08:1);labels[i].point.copy(a.p).add(V(0,2.35,0));
      const signal=state?.feedback?.[i];brainHalos[i].material.opacity=state?.phase==='feedback'?.4+Math.sin(t*5)*.2:0;brainHalos[i].material.color.set(signal?.delta<0?0x8c84ad:COLORS[i]);brainHalos[i].rotation.z=Math.sin(t)*.15;
      if(t-lastFK>1/24){const f=flies[i],gait=a.speed>3?run:walk,phase=(t*(a.speed>3?5:Math.max(.5,a.speed))+i*.25)%1,idx=Math.floor(phase*96),next=(idx+1)%96,frac=phase*96-idx;Object.assign(f.pose,neutral);if(a.speed>.3&&!reduced)for(const name in gait.frames[idx])f.pose[name]=THREE.MathUtils.lerp(gait.frames[idx][name],gait.frames[next][name],frac);for(const dof of rig.dofs){if(dof.name.includes('pedicel')&&dof.name.endsWith('yaw'))f.pose[dof.name]+=Math.sin(t*3+i)*.11;if(a.flight){if(dof.name.includes('wing')&&dof.name.endsWith('roll'))f.pose[dof.name]=(dof.name.includes('l_wing')?-1:1)*1.309*a.flight;if(dof.name.includes('wing')&&dof.name.endsWith('pitch'))f.pose[dof.name]=-.0524+.733*Math.sin(t*62.83)*a.flight;if(/-[lr][fmh]_/.test(dof.name))f.pose[dof.name]=THREE.MathUtils.lerp(f.pose[dof.name],flightPose.tuckedPose[dof.name],a.flight);}}const tr=segmentTransforms(rig,f.pose);for(const [name,m]of f.segments){m.matrix.set(...tr[name]);m.matrixAutoUpdate=false;}}
    }
    if(t-lastFK>1/24)lastFK=t;
    for(let i=0;i<2;i++){vaults[i].sugar.rotation.y=t*.6;vaults[i].sugar.position.y=1.25+Math.sin(t*2+i)*.12;vaults[i].sugar.visible=!(revealing&&e>5&&r.actions[1-state.match.hunter]===i);vaults[i].shield.material.opacity=revealing&&e>3?.025:.14+Math.sin(t*2)*.025;vaults[i].frame.rotation.y=revealing?smooth((e-3)/2)*Math.PI/2:0;
      if(revealing){const pts=[],end=clamp(e/5);for(let j=0;j<=40;j++)pts.push(routePosition(i,r.actions[i],end*j/40).add(V(0,.07,0)));trails[i].geometry.dispose();trails[i].geometry=new THREE.BufferGeometry().setFromPoints(pts);trails[i].visible=true;}else trails[i].visible=false;}
    const pick=state?.lockedPrediction?.agent??r?.prediction;if(pick!==undefined){const b=smooth(elapsed/1.3);betToken.position.lerpVectors(V(0,3,-7.3),V(starts[pick].x,2.5,4.7),b);betToken.position.y+=Math.sin(b*Math.PI)*3;}else betToken.position.set(0,3+Math.sin(t*2)*.3,-7.3);betToken.rotation.z=t*2;
    shock.visible=revealing&&e>7&&e<10;if(shock.visible){const p=holders[r.winner].position;shock.position.set(p.x,.25,p.z);shock.scale.setScalar(1+(e-7)*2);shock.material.opacity=clamp(1-(e-7)/3);}
    confetti.visible=revealing&&e>8;if(confetti.visible){const p=holders[r.winner].position;for(let j=0;j<64;j++){const a=j*2.399,life=((t+j*.13)%2)/2;particles[j*3]=p.x+Math.cos(a)*(life*2+.3);particles[j*3+1]=p.y+.5+Math.sin(life*Math.PI)*2.4;particles[j*3+2]=p.z+Math.sin(a)*(life*2+.3);}particleGeo.attributes.position.needsUpdate=true;}
    if(mode==='cinematic'&&!manual){let target=V(0,.7,-.7),cam=V(Math.sin(t*.075)*2,15.5,20.5);if(revealing&&e>3&&e<8){target=V(0,.8,-2.5);cam=V(3*Math.sin(t*.08),12,14);}if(revealing&&e>=8){target=holders[r.winner].position.clone().add(V(0,.7,0));cam=target.clone().add(V(r.winner===0?-6:6,6,10));}camera.position.lerp(cam,.028);controls.target.lerp(target,.04);}
    if(mode==='circuit')hot.material.opacity=.7+Math.sin(t*2)*.2;controls.update();for(const l of [...labels,...vaultLabels]){l.el.hidden=mode==='circuit';const p=l.point.clone().project(camera);l.el.style.left=`${(p.x*.5+.5)*container.clientWidth}px`;l.el.style.top=`${(-p.y*.5+.5)*(container.clientHeight-sceneTop)+sceneTop}px`;l.el.style.opacity=p.z>1?'0':'1';}renderer.render(scene,camera);
    drawRecording(elapsed); 
  }
  function drawRecording(elapsed){
    if(!recording||!state)return;
    if(!recording.started){if(state.phase!=='predict'||elapsed>1)return;recording.started=performance.now();recording.recorder.start();recording.onStatus?.('Recording this round…');}
    const c=recording.context,w=recording.canvas.width,h=recording.canvas.height;
    c.fillStyle='#090f1a';c.fillRect(0,0,w,h);
    const sw=renderer.domElement.width,sh=renderer.domElement.height,scale=Math.min(w/sw,620/sh);
    c.drawImage(renderer.domElement,(w-sw*scale)/2,55,sw*scale,sh*scale);
    for(let i=0;i<3;i++){const p=holders[i].position.clone().add(V(0,2.25,0)).project(camera),x=(w-sw*scale)/2+(p.x*.5+.5)*sw*scale,y=55+(-p.y*.5+.5)*sh*scale;c.font='600 15px sans-serif';c.textAlign='center';c.fillStyle='#09121ddd';c.fillRect(x-52,y-19,104,37);c.fillStyle=['#ff957a','#69d6ff','#ffda79'][i];c.fillText(NAMES[i],x,y-3);c.font='10px sans-serif';c.fillText(i===2?'THE BETTOR':i===state.match.hunter?'THE HUNTER':'THE THIEF',x,y+11);c.textAlign='left';}
    c.fillStyle='#e4ce81';c.font='500 17px monospace';c.fillText('FLY CIRCUIT ARENA  /  SUGAR HEIST',35,34);
    c.textAlign='right';c.fillStyle='#a8c5d7';c.fillText(`MATCH ${String(state.match.id).padStart(4,'0')} · ROUND ${state.match.round}/5`,w-35,34);c.textAlign='left';
    const r=state.currentRound,ready=r&&(state.phase==='feedback'||elapsed>=8);
    const title=ready?(r.winner===state.match.hunter?'INTERCEPTED!':'SUGAR STOLEN!'):state.phase==='predict'?'ONE STEALS. ONE HUNTS. ONE BETS.':state.phase==='think'?'PICK A VAULT. READ YOUR RIVAL.':state.phase==='sealed'?'ROUTES LOCKED.':'THE HEIST IS ON.';
    c.fillStyle='#f4e5bd';c.shadowColor='#000';c.shadowBlur=12;c.font='600 32px sans-serif';c.fillText(title,35,97);c.shadowBlur=0;
    c.fillStyle='#ccd8e5';c.font='16px sans-serif';c.fillText(ready?`${NAMES[r.winner]} +1 · Mica ${r.correct?'called it':'missed'}`:`${NAMES[1-state.match.hunter]} steals · ${NAMES[state.match.hunter]} hunts · Mica bets ${NAMES[state.lockedPrediction?.agent]||'…'}`,35,124);
    c.fillStyle='#101b2b';c.fillRect(0,h-63,w,63);c.fillStyle='#ff957a';c.font='500 21px monospace';c.fillText(`IRIS ${state.match.score[0]}`,35,h-24);c.fillStyle='#69cfff';c.fillText(`COBALT ${state.match.score[1]}`,210,h-24);c.fillStyle='#e4ce81';c.fillText(`MICA ${state.stats.predictions?(100*state.stats.correct/state.stats.predictions).toFixed(1)+'%':'—'}`,430,h-24);c.fillStyle='#9badc2';c.font='12px sans-serif';c.textAlign='right';c.fillText('Selected real connectome · Modeled learning · Virtual points',w-30,h-31);c.fillText('Live: fly-circuit-arena.fly-circuit-arena.workers.dev',w-30,h-13);c.textAlign='left';
    if(performance.now()-recording.started>=30000){recording.recorder.stop();recording=null;}
  }
  function record(onStatus){
    if(recording)throw new Error('A clip is already recording');mode='cinematic';manual=false;world.visible=true;cloud.visible=false;
    return new Promise((resolve,reject)=>{const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const stream=canvas.captureStream(30),mime=MediaRecorder.isTypeSupported('video/webm;codecs=vp9')?'video/webm;codecs=vp9':'video/webm';let recorder;try{recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6000000});}catch(e){reject(e);return;}const chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onstop=()=>{stream.getTracks().forEach(t=>t.stop());resolve(new Blob(chunks,{type:'video/webm'}));};recorder.onerror=e=>reject(e.error);recording={canvas,context:canvas.getContext('2d'),recorder,onStatus,started:null};onStatus?.('Waiting for the next round…');});
  }
  animate();onLoad?.();
  return {record,update(next){state=next;for(let i=0;i<2;i++)labels[i].el.innerHTML=`<span>0${i+1}</span>${NAMES[i]}<small>${next.match.hunter===i?'HUNTER':'THIEF'}</small>`;offset=next.serverTime-Date.now();const ids=next.lastRound?.decisions?.[0]?.trace?.hotIds||[];hotGeo.setAttribute('position',new THREE.Float32BufferAttribute(ids.filter(id=>nodeMap.has(id)).flatMap(id=>nodeMap.get(id).toArray()),3));},setMode(next){mode=next;manual=false;world.visible=next!=='circuit';cloud.visible=next==='circuit';if(next==='circuit'){camera.position.set(9,10,18);controls.target.set(0,3,0);}else if(next==='focus'){camera.position.copy(holders[0].position).add(V(-5,4,7));controls.target.copy(holders[0].position).add(V(0,.7,0));}else{camera.position.set(0,16,22);controls.target.set(0,.5,-.2);}controls.update();},dispose(){disposed=true;cancelAnimationFrame(raf);ro.disconnect();controls.dispose();renderer.dispose();}};
}
