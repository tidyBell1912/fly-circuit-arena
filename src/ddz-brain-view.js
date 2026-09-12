import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const V=(...a)=>new THREE.Vector3(...a);
const palette={PN:0x64d9d0,KC:0x8cbcef,MBON:0xff9b88,APL:0xf4cd74,DAN:0xc898eb};
const regionColors=[0x83a9dc,0x67d7cc,0xbc9add];
export async function createBrainView(container,onSelect,onTime){
 const [graph,anatomy]=await Promise.all(['/data/circuit-view.json','/data/male-cns-anatomy.json'].map(url=>fetch(url).then(r=>{if(!r.ok)throw Error('Anatomy unavailable');return r.json();})));
 const scene=new THREE.Scene();scene.background=new THREE.Color(0x071b26);
 const renderer=new THREE.WebGLRenderer({antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));container.append(renderer.domElement);
 renderer.domElement.setAttribute('role','img');renderer.domElement.setAttribute('aria-label','MaleCNS brain anatomy, both optic lobes and real neuron branches. Recorded simulated activity is restricted to the selected circuit.');
 const bounds=new THREE.Box3(V(...anatomy.bounds.min),V(...anatomy.bounds.max)),center=bounds.getCenter(V()),size=bounds.getSize(V()),scale=16/Math.max(size.x,size.y,size.z);
 // All anatomy and soma positions use the same original MaleCNS EM 8 nm coordinates.
 const transform=p=>V((p[0]-center.x)*scale,-(p[1]-center.y)*scale,(p[2]-center.z)*scale);
 const transformArray=a=>{const result=[];for(let i=0;i<a.length;i+=3)result.push(...transform(a.slice(i,i+3)).toArray());return result;};
 const camera=new THREE.PerspectiveCamera(36,1,.01,150),home=V(0,1,19.5);camera.position.copy(home);
 const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minDistance=3;controls.maxDistance=55;controls.autoRotate=false;controls.target.set(0,0,0);
 scene.add(new THREE.AmbientLight(0xc3d9ed,1.5));const light=new THREE.DirectionalLight(0xc4e6f8,2.5);light.position.set(-8,12,16);scene.add(light);
 const anatomicalGroup=new THREE.Group();scene.add(anatomicalGroup);
 anatomy.regions.forEach((region,index)=>{
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(transformArray(region.positions),3));geometry.setIndex(region.indices);geometry.computeVertexNormals();
  const color=regionColors[index%regionColors.length];
  const shell=new THREE.Mesh(geometry,new THREE.MeshPhongMaterial({color,emissive:color,emissiveIntensity:.08,shininess:55,transparent:true,opacity:.16,side:THREE.DoubleSide,depthWrite:false}));shell.renderOrder=1;anatomicalGroup.add(shell);
  const wire=new THREE.LineSegments(new THREE.WireframeGeometry(geometry),new THREE.LineBasicMaterial({color,transparent:true,opacity:.045,depthWrite:false}));anatomicalGroup.add(wire);
 });
 const skeletonMap=new Map(),skeletonObjects=[];
 anatomy.skeletons.forEach((cell,index)=>{
  const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(transformArray(cell.positions),3));geometry.setIndex(cell.edges);
  const color=cell.simulated?(palette[cell.role]||0x9fc9d4):new THREE.Color().setHSL((index*.061+.47)%1,.45,.6);
  const material=new THREE.LineBasicMaterial({color,transparent:true,opacity:cell.simulated?.65:.27,depthWrite:false});
  const line=new THREE.LineSegments(geometry,material);line.renderOrder=2;scene.add(line);skeletonMap.set(Number(cell.id??cell.bodyId),{line,cell,baseColor:new THREE.Color(color)});skeletonObjects.push(line);line.userData.bodyId=Number(cell.id??cell.bodyId);
 });
 const nodes=graph.nodes.filter(n=>n.position),nodeMap=new Map(),positions=[],colors=[];
 nodes.forEach((n,index)=>{const p=transform(n.position);nodeMap.set(n.id,{...n,p,index});positions.push(...p.toArray());colors.push(...new THREE.Color(palette[n.role]||0x82959b).toArray());});
 const geometry=new THREE.BufferGeometry().setAttribute('position',new THREE.Float32BufferAttribute(positions,3)).setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
 const points=new THREE.Points(geometry,new THREE.PointsMaterial({size:.065,vertexColors:true,transparent:true,opacity:.65,depthWrite:false}));points.renderOrder=3;scene.add(points);
 const hotGeo=new THREE.BufferGeometry(),hot=new THREE.Points(hotGeo,new THREE.PointsMaterial({color:0xffe1a0,size:.13,transparent:true,opacity:.95,depthWrite:false}));hot.renderOrder=4;scene.add(hot);
 const marker=new THREE.Mesh(new THREE.SphereGeometry(.13,16,12),new THREE.MeshBasicMaterial({color:0xffffff,wireframe:true,depthTest:false}));marker.visible=false;marker.renderOrder=5;scene.add(marker);
 let neural=null,neuronStates=new Map(),clockStart=performance.now(),selected=null,lastDecision=null,disposed=false,raf,focus=false,lastPaint=-1,capturing=false;
 const ray=new THREE.Raycaster();ray.params.Points.threshold=.1;ray.params.Line.threshold=.04;let pointerStart=null;
 const inspect=id=>{const n=nodeMap.get(Number(id))||graph.nodes.find(x=>x.id===Number(id));if(!n)return false;selected=n.id;marker.visible=!!n.p;if(n.p)marker.position.copy(n.p);onSelect?.(n,neuronStates.get(n.id)||null,neural);return true;};
 renderer.domElement.addEventListener('pointerdown',e=>pointerStart=[e.clientX,e.clientY]);renderer.domElement.addEventListener('pointerup',e=>{
  if(!pointerStart||Math.hypot(e.clientX-pointerStart[0],e.clientY-pointerStart[1])>6)return;
  const r=renderer.domElement.getBoundingClientRect();ray.setFromCamera({x:((e.clientX-r.left)/r.width)*2-1,y:-((e.clientY-r.top)/r.height)*2+1},camera);
  const point=ray.intersectObject(points)[0];if(point){inspect(nodes[point.index].id);return;}
  const branch=ray.intersectObjects(skeletonObjects.filter(o=>nodeMap.has(o.userData.bodyId)))[0];if(branch)inspect(branch.object.userData.bodyId);
 });
 const resize=()=>{const w=container.clientWidth,h=container.clientHeight;renderer.setSize(w,h);camera.aspect=w/h;home.z=Math.max(19.5,30/camera.aspect);if(!focus){camera.position.copy(home);controls.target.set(0,0,0);}camera.updateProjectionMatrix();};const ro=new ResizeObserver(resize);ro.observe(container);resize();
 let visible=true;const observer=new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;});observer.observe(container);
 function frame(now){if(disposed)return;raf=requestAnimationFrame(frame);if((!visible&&!capturing)||now-lastPaint<33)return;lastPaint=now;
  const time=((now-clockStart)%3200)/20,active=new Set(neural?.spikes?.filter(([t])=>t<=time&&t>time-8).map(([,id])=>id)||[]),v=[];
  active.forEach(id=>{const n=nodeMap.get(id);if(n)v.push(...n.p.toArray());});hotGeo.setAttribute('position',new THREE.Float32BufferAttribute(v,3));
  skeletonMap.forEach(({line,cell,baseColor},id)=>{const flashing=cell.simulated&&active.has(id);line.material.color.copy(flashing?new THREE.Color(0xffe2a3):baseColor);line.material.opacity=id===selected ? .98 : flashing ? .96 : cell.simulated ? (focus ? .7 : .55) : (focus ? .06 : .27);});
  marker.rotation.y+=.016;controls.update();renderer.render(scene,camera);onTime?.(time,active.size);
 }
 raf=requestAnimationFrame(frame);
 return {update(data){
  neural=data||null;neuronStates=new Map((data?.neurons||[]).map(row=>[row[0],row]));const key=data?`${data.at}/${data.decisionNumber}`:null;
  if(lastDecision!==key){clockStart=performance.now();lastDecision=key;}
  const c=geometry.attributes.color;nodes.forEach((n,i)=>{const row=neuronStates.get(n.id),count=row?.[2]||0,color=new THREE.Color(palette[n.role]||0x82959b);color.multiplyScalar(data?(row?Math.min(1.2,.5+count*.12):.3):.5);c.setXYZ(i,color.r,color.g,color.b);});c.needsUpdate=true;
  if(selected)inspect(selected);else if(data?.neurons?.length){const most=data.neurons.filter(r=>r[1]==='KC').sort((a,b)=>(b[2]||0)-(a[2]||0))[0];if(most)inspect(most[0]);}
 },inspect,setCapturing(value){capturing=value;},focusCircuit(value){focus=value;anatomicalGroup.visible=!value;if(value){const box=new THREE.Box3().setFromPoints([...nodeMap.values()].map(n=>n.p)),target=box.getCenter(V());controls.target.copy(target);camera.position.copy(target.clone().add(V(1,1,14)));}else{camera.position.copy(home);controls.target.set(0,0,0);}controls.update();},reset(){focus=false;anatomicalGroup.visible=true;camera.position.copy(home);controls.target.set(0,0,0);controls.update();},dispose(){disposed=true;cancelAnimationFrame(raf);controls.dispose();observer.disconnect();ro.disconnect();scene.traverse(object=>{object.geometry?.dispose();if(Array.isArray(object.material))object.material.forEach(m=>m.dispose());else object.material?.dispose();});renderer.dispose();}};
}
