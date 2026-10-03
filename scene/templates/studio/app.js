import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { ZONES, sceneReport } from './model.js';

const $=id=>document.getElementById(id),canvas=$('scene'),stage=$('stage');
const params=new URLSearchParams(location.search),buildMode=params.get('build')==='1';
const archiveMode=['127.0.0.1','localhost'].includes(location.hostname)&&params.get('archive')==='1';
const state={view:'overview',labels:true,roof:false,ready:false};
const names={overview:'整体视角',top:'俯视布局',inside:'场内视角'};
let renderer,scene,camera,controls,root,perspective,ortho,frame=null,width=1,height=1,report,toastTimer;
const labels=[];
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>$('toast').hidden=true,3200);}
function invalidate(){if(frame===null)frame=requestAnimationFrame(render);}
function render(){frame=null;const moving=controls.update();renderer.render(scene,camera);updateLabels();if(moving)invalidate();}
function updateLabels(){for(const {element,point} of labels){const p=point.clone().project(camera);element.hidden=!state.labels||state.view==='inside'||p.z>1||p.z< -1||Math.abs(p.x)>1||Math.abs(p.y)>1;element.style.left=`${(p.x*.5+.5)*width}px`;element.style.top=`${(-p.y*.5+.5)*height}px`;}}
function resize(){const rect=stage.getBoundingClientRect();width=Math.max(1,rect.width);height=Math.max(1,rect.height);renderer.setSize(width,height,false);perspective.aspect=width/height;perspective.updateProjectionMatrix();const half=Math.max(6.3,7.2/(width/height));Object.assign(ortho,{left:-half*width/height,right:half*width/height,top:half,bottom:-half});ortho.updateProjectionMatrix();if(state.view==='overview')setView('overview');else invalidate();}
function setView(view){
  state.view=view;controls?.dispose();camera=view==='top'?ortho:perspective;camera.zoom=1;camera.up.set(0,1,0);const target=new THREE.Vector3();
  if(view==='top'){camera.position.set(0,28,.001);target.set(0,0,0);}
  else if(view==='inside'){camera.fov=65;camera.position.set(0,1.65,4.3);target.set(-1.4,1.3,-3);}
  else{camera.fov=36;const fit=Math.max(1,1.15/(width/height));camera.position.set(15*fit,13*fit,18*fit);target.set(0,.8,0);}
  camera.lookAt(target);camera.updateProjectionMatrix();
  // Recreate controls so preset views never inherit drag or zoom damping.
  controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.dampingFactor=.09;controls.screenSpacePanning=false;controls.enableRotate=view!=='top';controls.minDistance=view==='inside'?.25:3;controls.maxDistance=75;controls.minZoom=.55;controls.maxZoom=5;controls.maxPolarAngle=view==='inside'?Math.PI*.55:Math.PI*.485;controls.target.copy(target);controls.update();
  controls.addEventListener('change',invalidate);controls.addEventListener('start',()=>canvas.style.cursor='grabbing');controls.addEventListener('end',()=>canvas.style.cursor='grab');
  document.querySelectorAll('button[data-view]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.view===view)));$('view-label').textContent=names[view];stage.dataset.view=view;invalidate();
}
function applyRoof(){const roof=root?.getObjectByName('Studio_Roof');if(roof)roof.visible=state.roof;stage.dataset.roof=String(state.roof);$('roof-note').textContent=state.roof?'完整屋顶已显示':'屋顶已隐藏，便于查看内部';invalidate();}
function selectZone(id){const zone=ZONES.find(zone=>zone.id===id);document.querySelectorAll('[data-zone]').forEach(button=>button.classList.toggle('active',button.dataset.zone===id));$('selection').hidden=!zone;if(!zone)return;$('selection-number').textContent=`ZONE / ${zone.n||''}`;$('selection-title').textContent=zone.title;$('selection-copy').textContent=zone.copy||zone.description||'';}
function makeZones(){ZONES.forEach((zone,index)=>{
  const number=zone.n||String(index+1).padStart(2,'0'),button=document.createElement('button');button.dataset.zone=zone.id;
  const n=document.createElement('span'),title=document.createElement('b'),arrow=document.createElement('em');n.className='zone-no';n.textContent=number;title.textContent=zone.title;arrow.textContent='↗';button.append(n,title,arrow);button.addEventListener('click',()=>selectZone(zone.id));$('zone-list').append(button);
  const position=zone.point||zone.position;if(!Array.isArray(position))return;const element=document.createElement('span'),b=document.createElement('b'),label=document.createElement('span');element.className='scene-label';b.textContent=number;label.textContent=zone.title;element.append(b,label);$('labels-layer').append(element);labels.push({element,point:new THREE.Vector3(...position).add(new THREE.Vector3(0,.2,0))});
});}
function captureBlob(){renderer.render(scene,camera);return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('画面暂未导出，请重试')),'image/png'));}
async function archiveCapture(){if(!state.ready)return;const button=$('save-capture');button.disabled=true;try{const blob=await captureBlob(),response=await fetch(`/__save_capture?view=${state.view}`,{method:'POST',headers:{'Content-Type':'image/png'},body:blob}),result=await response.json();if(!response.ok||!result.saved)throw new Error(result.error||`HTTP ${response.status}`);$('build-status').textContent=`已归档 ${result.path}`;stage.dataset.capture=state.view;toast(`已归档${names[state.view]}效果图`);}catch(error){$('build-status').textContent=`归档失败：${error.message}`;}finally{button.disabled=false;}}
async function saveModel(){const button=$('save-model');button.disabled=true;$('build-status').textContent='正在保存完整摄影工作室…';try{
  const [{GLTFExporter},{portableCopy}]=await Promise.all([import('three/addons/exporters/GLTFExporter.js'),import('./model.js')]),exportRoot=portableCopy(root),roof=exportRoot.getObjectByName('Studio_Roof');if(roof)roof.visible=true;
  const bytes=await new GLTFExporter().parseAsync(exportRoot,{binary:true,onlyVisible:false,animations:[],maxTextureSize:2048}),response=await fetch('/__save_model',{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:bytes}),result=await response.json();if(!response.ok||!result.saved)throw new Error(result.error||`HTTP ${response.status}`);
  $('build-status').textContent=`已保存 studio.glb · ${(bytes.byteLength/1024/1024).toFixed(2)} MB`;Object.assign(stage.dataset,{saved:'true',modelBytes:String(bytes.byteLength)});$('download').removeAttribute('aria-disabled');toast('完整摄影工作室已归档');
}catch(error){$('build-status').textContent=`保存失败：${error.message}`;console.error(error);}finally{button.disabled=false;}}
function bind(){document.querySelectorAll('button[data-view]').forEach(button=>button.addEventListener('click',()=>setView(button.dataset.view)));$('reset').addEventListener('click',()=>{setView('overview');selectZone(null);});$('close-selection').addEventListener('click',()=>selectZone(null));$('labels').addEventListener('change',event=>{state.labels=event.target.checked;stage.dataset.labels=String(state.labels);invalidate();});$('roof').addEventListener('change',event=>{state.roof=event.target.checked;applyRoof();});$('save-model').addEventListener('click',saveModel);$('save-capture').addEventListener('click',archiveCapture);$('download').addEventListener('click',event=>{if(event.currentTarget.getAttribute('aria-disabled')==='true'){event.preventDefault();toast('请先保存完整模型');}});canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();state.ready=false;stage.dataset.ready='false';$('loading').hidden=false;$('loading-message').textContent='三维绘图已中断，请刷新页面恢复。';});}
async function initialize(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.94;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFShadowMap;
  scene=new THREE.Scene();scene.background=new THREE.Color('#aaa69b');perspective=new THREE.PerspectiveCamera(36,1,.04,160);ortho=new THREE.OrthographicCamera(-9,9,7,-7,.05,160);camera=perspective;
  scene.add(new THREE.HemisphereLight('#fffaf0','#66675f',.75));const sun=new THREE.DirectionalLight('#fff2dc',1.85);sun.position.set(-4,11,8);sun.castShadow=true;sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-10,right:10,top:9,bottom:-9,near:.5,far:38});sun.shadow.normalBias=.025;sun.shadow.bias=-.00012;scene.add(sun);const fill=new THREE.DirectionalLight('#e5ebf0',.55);fill.position.set(8,8,-1);scene.add(fill);
  const pm=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment(),environment=pm.fromScene(room,.05);scene.environment=environment.texture;scene.environmentIntensity=.42;pm.dispose();room.dispose();
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(150,150),new THREE.MeshStandardMaterial({color:'#aaa69b',roughness:.97}));ground.rotation.x=-Math.PI/2;ground.position.y=-.22;ground.receiveShadow=true;scene.add(ground);
  bind();makeZones();new ResizeObserver(resize).observe(stage);resize();
  if(buildMode||archiveMode)$('build-bar').hidden=false;
  if(buildMode){$('download').setAttribute('aria-disabled','true');$('save-model').hidden=false;const {buildStudio}=await import('./model.js');await document.fonts.ready;root=await buildStudio();$('save-model').disabled=false;}
  else{const gltf=await new GLTFLoader().loadAsync('./studio.glb');root=gltf.scene.getObjectByName('Studio_Photography_12x10');if(!root)throw new Error('模型不是完整摄影工作室模板');}
  root.traverse(object=>{if(object.isMesh){object.castShadow=true;object.receiveShadow=true;}});scene.add(root);report=sceneReport(root);applyRoof();state.ready=true;$('loading').hidden=true;$('load-status').textContent=buildMode?'场景构建完成':'完整模型已载入';$('save-capture').disabled=false;
  Object.assign(stage.dataset,{ready:'true',modelSource:buildMode?'build':'studio.glb',labels:String(state.labels),meshes:String(report.meshes??''),triangles:String(report.triangles??'')});setView('overview');
  const details=document.createElement('script');details.type='application/json';details.id='scene-validation';details.textContent=JSON.stringify(report);document.body.append(details);
}
initialize().catch(error=>{stage.dataset.ready='false';$('loading').hidden=false;$('loading-message').textContent=`暂未载入：${error.message}`;$('load-status').textContent='场景载入失败';console.error(error);});
