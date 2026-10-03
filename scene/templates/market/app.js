import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ZONES, PHASES, applyPhase, sceneReport } from './model.js';

const $ = id => document.getElementById(id);
const canvas = $('scene'), stage = $('stage');
const params = new URLSearchParams(location.search);
const buildMode = params.get('build') === '1';
const localArchive = ['127.0.0.1', 'localhost'].includes(location.hostname) && params.get('archive') === '1';
const state = { view:'overview', phase:'open', labels:true, canopies:true, ready:false };
const names = { overview:'整体视角', top:'俯视布局', inside:'场内视角' };
const defaults = {
  setup:{clock:'08:00 — 10:00',text:'清晨柔光，查看摊位与物料的完整布置。'},
  open:{clock:'10:00 — 17:00',text:'明亮日光，查看主环线、摊位与中央休憩区。'},
  evening:{clock:'17:00 — 19:00',text:'暖色斜阳与灯串亮光，查看傍晚的空间氛围。'},
  closed:{clock:'19:00 — 20:00',text:'低亮环境与基础灯光，查看收摊时段的照明效果。'}
};
let renderer, scene, camera, controls, root, sun, hemi, fill, environment;
let ortho, perspective, frame = null, width = 1, height = 1, report = null, toastTimer;
const labels = [];
function toast(message) { clearTimeout(toastTimer); $('toast').textContent=message; $('toast').hidden=false; toastTimer=setTimeout(()=>$('toast').hidden=true,3200); }
function invalidate() { if(frame===null) frame=requestAnimationFrame(render); }
function render() { frame=null; const moving=controls.update(); renderer.render(scene,camera); updateLabels(); if(moving) invalidate(); }
function updateLabels() {
  for(const {element,point} of labels) {
    const p=point.clone().project(camera);
    element.hidden=!state.labels||state.view==='inside'||p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1;
    element.style.left=`${(p.x*.5+.5)*width}px`; element.style.top=`${(-p.y*.5+.5)*height}px`;
  }
}
function resize() {
  const rect=stage.getBoundingClientRect(); width=Math.max(1,rect.width); height=Math.max(1,rect.height);
  renderer.setSize(width,height,false); perspective.aspect=width/height; perspective.updateProjectionMatrix();
  const half=Math.max(13,17/(width/height));
  Object.assign(ortho,{left:-half*width/height,right:half*width/height,top:half,bottom:-half}); ortho.updateProjectionMatrix();
  if(state.view==='overview') setView('overview'); else invalidate();
}
function setView(view) {
  state.view=view; controls?.dispose();
  camera=view==='top'?ortho:perspective;camera.zoom=1;camera.up.set(0,1,0);
  const target=new THREE.Vector3();
  if(view==='top') { camera.position.set(0,48,.001); target.set(0,0,0); }
  else if(view==='inside') { camera.fov=68; camera.position.set(0,1.75,9); target.set(0,1.6,-5); }
  else { camera.fov=38; const fit=Math.max(1,1.2/(width/height)); camera.position.set(24*fit,23*fit,29*fit); target.set(0,.7,0); }
  camera.lookAt(target);camera.updateProjectionMatrix();
  // A fresh controller drops accumulated rotation/pan damping between presets.
  controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.09;controls.screenSpacePanning=false;
  controls.enableRotate=view!=='top';controls.minDistance=view==='inside'?.4:6;controls.maxDistance=125;controls.minZoom=.55;controls.maxZoom=5;
  controls.maxPolarAngle=view==='inside'?Math.PI*.55:Math.PI*.485;controls.target.copy(target);controls.update();
  controls.addEventListener('change',invalidate);controls.addEventListener('start',()=>canvas.style.cursor='grabbing');controls.addEventListener('end',()=>canvas.style.cursor='grab');
  document.querySelectorAll('button[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));
  $('view-label').textContent=names[view]; stage.dataset.view=view; invalidate();
}
function applyDisplay() {
  const canopies=root.getObjectByName('Market_Canopies'); if(canopies) canopies.visible=state.canopies;
  Object.assign(stage.dataset,{canopies:String(state.canopies),labels:String(state.labels)});
}
function updatePhase() {
  if(!root) return;
  applyPhase(root,state.phase);
  const phase=PHASES[state.phase]||defaults[state.phase];
  $('phase-clock').textContent=phase.clock||defaults[state.phase].clock;
  $('phase-description').textContent=defaults[state.phase].text;
  document.querySelectorAll('[data-phase]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.phase===state.phase)));
  const light={
    setup:{sun:1.85,color:'#ffe6c0',position:[-15,16,12],hemi:.95,fill:.6,environment:.6,exposure:.97,background:'#e9e0cf',lantern:.04},
    open:{sun:2.5,color:'#fff0d5',position:[-10,24,14],hemi:1.05,fill:.65,environment:.65,exposure:1.03,background:'#e8e0cf',lantern:.08},
    evening:{sun:1.1,color:'#ffb56f',position:[-18,8,14],hemi:.7,fill:.35,environment:.4,exposure:.9,background:'#c6b5aa',lantern:2.3},
    closed:{sun:.42,color:'#dce5ff',position:[-10,18,14],hemi:.5,fill:.3,environment:.35,exposure:.82,background:'#969da2',lantern:.65}
  }[state.phase];
  sun.intensity=light.sun;sun.color.set(light.color);sun.position.set(...light.position);hemi.intensity=light.hemi;fill.intensity=light.fill;
  scene.environmentIntensity=light.environment;renderer.toneMappingExposure=light.exposure;scene.background.set(light.background);
  root.traverse(o=>{if(!o.isMesh)return;for(const material of Array.isArray(o.material)?o.material:[o.material])if(material.name==='Lantern warm light')material.emissiveIntensity=light.lantern;});
  applyDisplay();
  Object.assign(stage.dataset,{phase:state.phase,phaseMode:'lighting-only',stalls:'12',diningTables:'4'});
  invalidate();
}
function selectZone(id) {
  const zone=ZONES.find(z=>z.id===id);
  document.querySelectorAll('[data-zone]').forEach(b=>b.classList.toggle('active',b.dataset.zone===id));
  $('selection').hidden=!zone; if(!zone)return;
  $('selection-number').textContent=`ZONE / ${zone.n||''}`; $('selection-title').textContent=zone.title;
  $('selection-copy').textContent=zone.copy||zone.description||'';
}
function makeZones() {
  ZONES.forEach((zone,index)=>{
    const number=zone.n||String(index+1).padStart(2,'0');
    const button=document.createElement('button'); button.dataset.zone=zone.id;
    const n=document.createElement('span'); n.className='zone-no'; n.textContent=number;
    const text=document.createElement('span'), title=document.createElement('b'), subtitle=document.createElement('small'), arrow=document.createElement('em');
    title.textContent=zone.title; subtitle.textContent=zone.subtitle||zone.short||['先看看，今天有什么','十二个小摊，各有心意','不赶时间，绕着逛逛','坐下来，吃点喜欢的','留张合影，听一首歌','让散场也有条不紊'][index]||''; arrow.textContent='↗';
    text.append(title,subtitle);button.append(n,text,arrow);button.addEventListener('click',()=>selectZone(zone.id));$('zone-list').append(button);
    const point=zone.point||zone.position; if(!Array.isArray(point))return;
    const element=document.createElement('span'); element.className='scene-label'; const b=document.createElement('b'), label=document.createElement('span'); b.textContent=number;label.textContent=zone.title;element.append(b,label);$('labels-layer').append(element);
    labels.push({element,point:new THREE.Vector3(...point).add(new THREE.Vector3(0,.35,0))});
  });
}
function captureBlob() { renderer.render(scene,camera); return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画面暂未导出，请重试')),'image/png')); }
async function downloadCapture() {
  if(!state.ready)return;
  try { const blob=await captureBlob();const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`户外市集-${state.phase}-${state.view}.png`;a.click();setTimeout(()=>URL.revokeObjectURL(a.href),5000);toast('已导出当前三维画面'); }catch(error){toast(error.message);}
}
async function archiveCapture() {
  if(!state.ready)return;const button=$('save-capture');button.disabled=true;
  try { const blob=await captureBlob();const response=await fetch(`/__save_capture?view=${state.view}`,{method:'POST',headers:{'Content-Type':'image/png'},body:blob});const result=await response.json();if(!response.ok||!result.saved)throw new Error(result.error||`HTTP ${response.status}`);$('build-status').textContent=`已归档 ${result.path}`;stage.dataset.capture=state.view;toast(`已归档${names[state.view]}效果图`); }catch(error){$('build-status').textContent=`归档失败：${error.message}`;}finally{button.disabled=false;}
}
async function saveModel() {
  const button=$('save-model');button.disabled=true;$('build-status').textContent='正在保存完整市集模型…';
  try {
    const [{GLTFExporter},{portableCopy}]=await Promise.all([import('three/addons/exporters/GLTFExporter.js'),import('./model.js')]);
    const exportRoot=portableCopy?portableCopy(root):root.clone(true);applyPhase(exportRoot,'open');
    const canopies=exportRoot.getObjectByName('Market_Canopies');if(canopies)canopies.visible=true;
    const bytes=await new GLTFExporter().parseAsync(exportRoot,{binary:true,onlyVisible:false,animations:[],maxTextureSize:2048});
    const response=await fetch('/__save_model',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes});const result=await response.json();
    if(!response.ok||!result.saved)throw new Error(result.error||`HTTP ${response.status}`);
    $('build-status').textContent=`已保存 market.glb · ${(bytes.byteLength/1024/1024).toFixed(2)} MB`;
    Object.assign(stage.dataset,{saved:'true',modelBytes:String(bytes.byteLength)});$('download').removeAttribute('aria-disabled');toast('完整市集模型已归档');
  }catch(error){$('build-status').textContent=`保存失败：${error.message}`;console.error(error);}finally{button.disabled=false;}
}
function bind() {
  document.querySelectorAll('button[data-view]').forEach(b=>b.addEventListener('click',()=>setView(b.dataset.view)));
  document.querySelectorAll('button[data-phase]').forEach(b=>{
    const phase=PHASES[b.dataset.phase];if(phase){if(phase.title)b.querySelector('b').textContent=phase.title;if(phase.clock)b.querySelector('small').textContent=phase.clock.split(' — ')[0];}
    b.addEventListener('click',()=>{state.phase=b.dataset.phase;updatePhase();});
  });
  $('close-selection').addEventListener('click',()=>selectZone(null));$('reset').addEventListener('click',()=>{setView('overview');selectZone(null);});
  $('labels').addEventListener('change',e=>{state.labels=e.target.checked;stage.dataset.labels=String(state.labels);invalidate();});
  $('canopies').addEventListener('change',e=>{state.canopies=e.target.checked;applyDisplay();invalidate();});
  $('snapshot').addEventListener('click',downloadCapture);$('save-capture').addEventListener('click',archiveCapture);$('save-model').addEventListener('click',saveModel);
  $('download').addEventListener('click',e=>{if(e.currentTarget.getAttribute('aria-disabled')==='true'){e.preventDefault();toast('请先保存完整市集模型');}});
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();$('loading').hidden=false;$('loading-message').textContent='三维绘图已中断，请刷新页面恢复。';state.ready=false;stage.dataset.ready='false';});
}
function fallbackReport() {
  let meshes=0,triangles=0;root.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position?.count??0)/3;});
  return {meshes,triangles,root:root.name};
}
async function initialize() {
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#e8e0cf');perspective=new THREE.PerspectiveCamera(38,1,.06,260);ortho=new THREE.OrthographicCamera(-20,20,15,-15,.05,260);camera=perspective;
  hemi=new THREE.HemisphereLight('#fff5dd','#8e9c7d',1.05);scene.add(hemi);sun=new THREE.DirectionalLight('#fff0d5',2.5);sun.position.set(-10,24,14);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-23,right:23,top:20,bottom:-20,near:.5,far:70});sun.shadow.normalBias=.045;sun.shadow.bias=-.00015;scene.add(sun);
  fill=new THREE.DirectionalLight('#edf3e9',.65);fill.position.set(14,12,-5);scene.add(fill);
  const pm=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();environment=pm.fromScene(room,.05);scene.environment=environment.texture;scene.environmentIntensity=.65;pm.dispose();room.dispose();
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(240,240),new THREE.MeshStandardMaterial({color:'#e8e0cf',roughness:.98}));ground.rotation.x=-Math.PI/2;ground.position.y=-.19;ground.receiveShadow=true;scene.add(ground);
  bind();makeZones();new ResizeObserver(resize).observe(stage);resize();
  if(localArchive||buildMode){$('build-bar').hidden=false;$('build-label').textContent=buildMode?'构建模式 · 将全部素材归档为独立 GLB':'本机归档 · 当前画面保存至 renders/';}
  if(buildMode){$('download').setAttribute('aria-disabled','true');$('save-model').hidden=false;const {buildMarket}=await import('./model.js');await document.fonts.ready;root=await buildMarket();$('save-model').disabled=false;}
  else {const gltf=await new GLTFLoader().loadAsync('./market.glb');root=gltf.scene.getObjectByName('Market_Outdoor_30x22');if(!root)throw new Error('模型不是完整市集模板');}
  root.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});scene.add(root);report=sceneReport?sceneReport(root):fallbackReport();
  state.ready=true;$('loading').hidden=true;$('load-status').textContent=buildMode?'场景构建完成':'完整模型已载入';$('save-capture').disabled=false;
  Object.assign(stage.dataset,{ready:'true',modelSource:buildMode?'build':'market.glb',meshes:String(report.meshes??''),triangles:String(report.triangles??'')});updatePhase();setView('overview');
  const details=document.createElement('script');details.type='application/json';details.id='scene-validation';details.textContent=JSON.stringify(report);document.body.append(details);
}
initialize().catch(error=>{$('loading').hidden=false;$('loading-message').textContent=`暂未载入：${error.message}`;$('load-status').textContent='场景载入失败';stage.dataset.ready='false';console.error(error);});
