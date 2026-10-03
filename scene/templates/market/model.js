import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ZONES = [
 {id:'arrival',n:'01',title:'入口与导览',point:[0,3.6,9.4],copy:'5.4 米入口框架与两侧导览牌。中间保留 3 米宽的进入通道，先看地图再开始逛。'},
 {id:'stalls',n:'02',title:'十二间小店',point:[-11,3.4,0],copy:'两侧各 4 个摊位，北侧 4 个摊位。每摊 3.2 × 2.4 米，独立柜台与商品，向广场内侧营业。'},
 {id:'loop',n:'03',title:'慢逛环线',point:[-6.3,.05,5.8],copy:'2 米宽的矩形主环线连接三侧摊位，摊前停留带与主环线分开。环线内不摆放家具和摊位。'},
 {id:'dining',n:'04',title:'歇脚与餐饮',point:[-3.1,2.9,2.6],copy:'四张餐桌、十六把座椅与两把遮阳伞组成中央休憩区。棚伞采用独立配重底座，尺度仅用于概念展示。'},
 {id:'stage',n:'05',title:'小小现场',point:[0,2.3,-2],copy:'4.8 × 2.6 米小舞台，设麦克风、音箱与拍照背景。台前留出停留空间，不放置人物模型。'},
 {id:'service',n:'06',title:'回收与后勤',point:[11,1.5,9.4],copy:'东南角设置分类桶与物资柜；西南角保留补货箱。属于场景示意，尚未代入现场供电、排水与收运条件。'},
];
export const PHASES = {
 setup:{title:'布展准备',clock:'08:00 — 10:00',text:'柔和晨光下查看场地、摊位和物料配置。结构与物料保持固定。'},
 open:{title:'开市慢逛',clock:'10:00 — 17:00',text:'日间光照下查看完整市集布局：12 个摊位、中央休憩区与小舞台。'},
 evening:{title:'傍晚小聚',clock:'17:00 — 19:00',text:'暖色斜照与灯串营造傍晚氛围，摊位和家具布局保持固定。'},
 closed:{title:'收摊整理',clock:'19:00 — 20:00',text:'切换为较低亮度的基础照明；不模拟物料撤除。'},
};
export const STALLS = [
 ...[-6,-2,2,6].map((z,i)=>({id:i+1,x:-11,z,r:Math.PI/2})),
 ...[-6,-2,2,6].map((z,i)=>({id:i+5,x:11,z,r:-Math.PI/2})),
 ...[-6,-2,2,6].map((x,i)=>({id:i+9,x,z:-8,r:0})),
];
export const OPEN_SPOTS = [];
export const EVENING_SPOTS = [];
export const AISLES = [
 {id:'west-loop',x:-6.3,z:.5,width:2,depth:12.8},
 {id:'east-loop',x:6.3,z:.5,width:2,depth:12.8},
 {id:'north-loop',x:0,z:-4.9,width:12.6,depth:2},
 {id:'south-loop',x:0,z:6.3,width:12.6,depth:2},
 {id:'entry',x:0,z:8.75,width:3,depth:3.5},
];
function tex(draw,w=512,h=512){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function sign(title,sub,bg='#f1e8d3',ink='#2c4b40'){return tex((c,w,h)=>{c.fillStyle=bg;c.fillRect(0,0,w,h);c.fillStyle=ink;c.textAlign='center';c.textBaseline='middle';c.font='500 98px "Songti SC", serif';c.fillText(title,w/2,h*.43,w*.92);c.font='24px sans-serif';c.fillText(sub,w/2,h*.79,w*.9);},1024,384);}
function grain(color,wood=false){return tex((c,w,h)=>{c.fillStyle=color;c.fillRect(0,0,w,h);let seed=1208;for(let i=0;i<6000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%w;seed=(Math.imul(seed,1664525)+1013904223)>>>0;const y=seed%h;c.fillStyle=i%2?'#ffffff0b':'#251d180a';c.fillRect(x,wood?0:y,1,wood?h:1);}});}
export async function buildMarket(){
 const root=new THREE.Group();root.name='Market_Outdoor_30x22';
 const groups={};for(const key of ['Ground','Stalls','Furniture','LightingRig','Decor','Canopies']){groups[key]=new THREE.Group();groups[key].name=`Market_${key}`;root.add(groups[key]);}
 const footprints=[],assetInstances=[];let seq=0;
 const mat=(name,color,extra={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.75,...extra});m.name=name;return m;};
 const cream=mat('Cotton canvas','#eadfbd'),green=mat('Forest canvas','#486856'),orange=mat('Terracotta canvas','#b75d3d'),wood=mat('Timber','#c2a077',{map:grain('#ddc5a3',true)}),dark=mat('Deep green metal','#293e35',{metalness:.35}),sand=mat('Warm pavers','#c8b99d',{map:grain('#dfd3ba')}),path=mat('Loop sandstone','#e6dcc5'),white=mat('Ivory','#fff4d7'),soil=mat('Soil','#645546'),leaf=mat('Sage foliage','#7d9468');
 const bulb=mat('Lantern warm light','#ffdf93',{emissive:'#ffce7a',emissiveIntensity:1.2});
 function mesh(geo,m,x,y,z,p=groups.Decor,n='Part'){const o=new THREE.Mesh(geo,m);o.position.set(x,y,z);o.name=`${n}_${++seq}`;o.castShadow=true;o.receiveShadow=true;p.add(o);return o;}
 const box=(w,h,d,x,y,z,m=wood,p=groups.Furniture,n='Box')=>mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,p,n);
 const cyl=(r,h,x,y,z,m=wood,p=groups.Furniture,n='Cylinder')=>mesh(new THREE.CylinderGeometry(r,r,h,16),m,x,y,z,p,n);
 function panel(title,sub,w,h,x,y,z,p=groups.Decor,bg,ink){const m=mat(`Graphic_${title}`,'#ffffff',{map:sign(title,sub,bg,ink)});return mesh(new THREE.PlaneGeometry(w,h),m,x,y,z,p,'Sign');}
 function fp(id,x,z,w,d,category='furniture'){footprints.push({id,x,z,width:w,depth:d,category});}
 function rod(a,b,r,m,p=groups.LightingRig,n='Cable'){const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),o=mesh(new THREE.CylinderGeometry(r,r,va.distanceTo(vb),8),m,0,0,0,p,n);o.position.copy(va).add(vb).multiplyScalar(.5);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),vb.sub(va).normalize());return o;}
 box(30,.16,22,0,-.08,0,sand,groups.Ground,'Site_30x22m');
 for(const a of AISLES)box(a.width,.012,a.depth,a.x,.009,a.z,path,groups.Ground,`Aisle_${a.id}`);
 for(let x=-14;x<=14;x+=2)box(.015,.003,22,x,.003,0,path,groups.Ground,'PaverJoint');
 for(let z=-10;z<=10;z+=2)box(30,.003,.015,0,.003,z,path,groups.Ground,'PaverJoint');
 // Flat inset edging does not narrow the marked paths.
 for(const x of [-14.9,14.9])box(.12,.07,21.8,x,.035,0,wood,groups.Ground,'SiteEdge');
 for(const z of [-10.9,10.9])box(29.8,.07,.12,0,.035,z,wood,groups.Ground,'SiteEdge');
 const names=['山野花铺','手作陶器','香气小屋','旧物新生','一杯咖啡','面包日常','小农鲜果','甜点时光','手绘明信片','织物日记','木作杂货','书与远方'];
 const productMats=['#c98152','#78935e','#dfb367','#d9cab0','#5e756f','#a5684c'].map((c,i)=>mat(`Merchandise_${i}`,c));
 for(const s of STALLS){
  const g=new THREE.Group();g.name=`Stall_${String(s.id).padStart(2,'0')}`;g.position.set(s.x,0,s.z);g.rotation.y=s.r;groups.Stalls.add(g);
  box(3.2,.07,2.4,0,.035,0,wood,g,'StallDeck');
  for(const x of [-1.48,1.48])for(const z of [-1.08,1.08])box(.07,2.6,.07,x,1.3,z,wood,g,'StallPost');
  box(2.85,.89,.6,0,.485,.68,wood,g,'SalesCounter');box(2.96,.07,.72,0,.96,.68,cream,g,'CounterTop');
  box(2.9,.13,.12,0,2.46,1.08,wood,g,'FasciaRail');
  for(let x=-1.3;x<1.4;x+=.2)box(.025,.7,.015,x,.45,.989,dark,g,'CounterSlat');
  box(2.8,.12,.35,0,1.35,-.88,wood,g,'RearShelf');box(2.8,.12,.35,0,.68,-.88,wood,g,'RearShelf');
  panel(`${String(s.id).padStart(2,'0')}  ${names[s.id-1]}`,'WEEKEND MARKET',2.72,.41,0,2.29,1.125,g,'#efe4c7','#314c40');
  const roofGroup=new THREE.Group();roofGroup.name=`Canopy_${s.id}`;roofGroup.position.copy(g.position);roofGroup.rotation.y=s.r;groups.Canopies.add(roofGroup);
  const pitch=Math.atan2(.5,1.34),length=Math.hypot(1.34,.5);
  for(const side of [-1,1])for(let i=0;i<8;i++){const o=box(.424,.045,length,(i-3.5)*.424,2.85,side*.67,i%2?cream:(s.id%3===0?green:orange),roofGroup,'StripedRoof');o.rotation.x=side*pitch;}
  for(let i=0;i<8;i++)box(.424,.2,.045,(i-3.5)*.424,2.5,1.33,i%2?cream:(s.id%3===0?green:orange),roofGroup,'CanvasValance');
  for(let j=0;j<5;j++){
   const x=-1.07+j*.52,m=productMats[(s.id+j)%6];
   if(s.id===1){cyl(.11,.19,x,1.09,.68,orange,g,'FlowerPot');for(let k=0;k<3;k++){rod([x,1.18,.68],[x+(k-1)*.06,1.5,.68],.014,leaf,g,'FlowerStem');mesh(new THREE.IcosahedronGeometry(.09,1),m,x+(k-1)*.06,1.5,.68,g,'Bloom');}}
   else if(s.id%3===0){cyl(.10,.22,x,1.11,.68,m,g,'Jar');cyl(.11,.04,x,1.24,.68,wood,g,'Lid');}
   else if(s.id%3===1){box(.31,.13,.24,x,1.07,.68,m,g,'CraftBox');box(.27,.018,.21,x,1.15,.68,cream,g,'PaperWrap');}
   else{const o=mesh(new THREE.SphereGeometry(.13,10,8),m,x,1.10,.68,g,'BreadOrCeramic');o.scale.y=.62;}
   box(.26,.25,.18,x,1.535,-.88,m,g,'ShelfGoods');
  }
  const [width,depth]=s.r===0?[3.2,2.4]:[2.4,3.2];fp(g.name,s.x,s.z,width,depth,'stall');
 }
 // A gate with a clear centre and grounded, separate signboards.
 for(const x of [-2.8,2.8]){box(.16,3.8,.16,x,1.9,9.65,dark,groups.Decor,'EntryPost');box(.55,.12,.55,x,.06,9.65,wood);fp(`entry-base-${x}`,x,9.65,.55,.55);}
 box(5.76,.62,.12,0,3.48,9.65,dark,groups.Decor,'EntryHeader');panel('风物市集','SLOW SATURDAY / GOOD THINGS HERE',5.3,.55,0,3.48,9.72,groups.Decor,'#294c3e','#f4e9cc');
 for(const [x,title,sub] of [[-4,'今日开市','12 SHOPS · 10:00—19:00'],[4,'慢慢逛 · 好好玩','COFFEE / CRAFT / LIVE']]){box(.12,1.9,.1,x,.95,9.5,dark);box(1.45,.10,.7,x,.05,9.5,wood);box(1.35,1.32,.07,x,1.3,9.5,green);panel(title,sub,1.27,.6,x,1.47,9.545,groups.Decor,'#496b55','#fff0cc');fp(`entry-sign-${x}`,x,9.5,1.45,.7);}
 // Small stage stays inside the ring; the audience stands on the plaza floor.
 box(4.8,.28,2.6,0,.14,-1.9,wood,groups.Furniture,'Stage_4_8x2_6');fp('stage',0,-1.9,4.8,2.6,'stage');
 box(4.7,2.48,.13,0,1.52,-3.1,green,groups.Decor,'StageBackdrop');panel('把周末，交给风。','MUSIC / STORIES / A LITTLE GOOD COMPANY',4.35,.84,0,1.95,-3.025,groups.Decor,'#496b55','#f1dfb5');
 panel('风物现场','17:00 / SMALL LIVE',2.35,.38,0,1.12,-3.019,groups.Decor,'#496b55','#f1dfb5');
 for(const x of [-2.0,2.0]){box(.36,.67,.33,x,.615,-2.1,dark);for(let i=0;i<5;i++)box(.27,.012,.008,x,.42+i*.08,-1.929,soil);}
 box(1.5,.14,.36,0,.07,-.44,wood);fp('stage-step',0,-.44,1.5,.36);
 // Existing CC0 assets are copied locally; load failure is explicit.
 const roles=['table','chair','planter','bin','parasol','microphone'];const loader=new GLTFLoader();const sourceList=await Promise.all(roles.map(r=>loader.loadAsync(`./assets/models/${r}.glb`)));const sources=Object.fromEntries(roles.map((r,i)=>[r,sourceList[i].scene]));
 function asset(role,x,z,h,rot=0,y=0,record=true){const group=new THREE.Group();group.name=`Asset_${role}_${++seq}`;const obj=sources[role].clone(true);obj.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(obj),size=b.getSize(new THREE.Vector3()),center=b.getCenter(new THREE.Vector3());obj.position.sub(new THREE.Vector3(center.x,b.min.y,center.z));group.add(obj);group.scale.setScalar(h/size.y);group.rotation.y=rot;group.position.set(x,y,z);groups.Furniture.add(group);group.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(group),ss=bb.getSize(new THREE.Vector3()),cc=bb.getCenter(new THREE.Vector3());if(record)fp(group.name,cc.x,cc.z,ss.x,ss.z,'asset');assetInstances.push({name:group.name,role,source:`assets/models/${role}.glb`,height:h});return group;}
 for(const x of [-3.3,3.3])for(const z of [2.15,4.15]){
  asset('table',x,z,.77,0);for(const dx of [-.55,.55])for(const side of [-1,1])asset('chair',x+dx,z+side*.68,.86,side===1?Math.PI:0);
  cyl(.065,.11,x,.835,z,cream);box(.18,.004,.15,x+.38,.773,z,white);
 }
 for(const x of [-4.7,4.7]){asset('parasol',x,3.15,2.95,0,0,false);fp(`parasol-base-${x}`,x,3.15,.6,.6);}
 asset('microphone',0,-2,1.5,Math.PI,.28,false);
 for(const [x,z] of [[-13.5,-9],[13.5,-9],[-13.5,9],[13.5,7.9],[-8.5,9.3],[8.5,9.3]])asset('planter',x,z,1.45);
 for(let i=0;i<3;i++){asset('bin',10.1+i*.8,9.2,.88);panel(['纸类','包装','其他'][i],'SORT & RECYCLE',.46,.19,10.1+i*.8,1.16,9.2);}
 box(2.2,1.1,.85,11.0,.55,10.3,green);fp('service-storage',11,10.3,2.2,.85);panel('后勤 / 回收','STAFF CORNER',1.55,.35,11,.67,10.735);
 for(const x of [-11.6,-10.4]){box(.95,.62,.7,x,.31,9.4,wood);box(.8,.38,.65,x,.81,9.4,wood);fp(`supply-${x}`,x,9.4,.95,.7);}
 // Six small trees grow in boxed planters at the outer edge.
 for(const [x,z] of [[-13.6,-5],[-13.6,3],[13.6,-5],[13.6,3],[-10,-9.75],[10,-9.75]]){
  box(.95,.4,.95,x,.2,z,wood);box(.82,.04,.82,x,.42,z,soil);cyl(.10,2.3,x,1.5,z,wood,groups.Decor,'TreeTrunk');
  for(const [dx,dy,dz,r] of [[0,0,0,1.05],[-.6,-.1,.15,.65],[.6,.2,-.1,.72],[0,.7,.05,.65]])mesh(new THREE.IcosahedronGeometry(r,2),leaf,x+dx,2.6+dy,z+dz,groups.Decor,'TreeCrown');fp(`tree-base-${x}-${z}`,x,z,.95,.95);
 }
 // Festoon lines span overhead; support bases stay out of the 2 m ring.
 for(const x of [-8,8])for(const z of [-6.8,7.8]){cyl(.045,4.3,x,2.15,z,dark,groups.LightingRig,'FestoonPole');box(.5,.16,.5,x,.08,z,dark,groups.LightingRig,'PoleBase');fp(`pole-${x}-${z}`,x,z,.5,.5);}
 for(const z of [-6.8,7.8]){for(let i=0;i<24;i++){const x=-8+i*16/24,x2=-8+(i+1)*16/24;const y=4.3-.65*Math.sin(i/24*Math.PI),y2=4.3-.65*Math.sin((i+1)/24*Math.PI);rod([x,y,z],[x2,y2,z],.013,dark);if(i%2===0){rod([x,y,z],[x,y-.13,z],.016,dark);mesh(new THREE.SphereGeometry(.085,10,8),bulb,x,y-.2,z,groups.LightingRig,'FestoonBulb');}}}
 for(const x of [-8,8])for(let i=0;i<20;i++){const z=-6.8+i*14.6/20,z2=-6.8+(i+1)*14.6/20,y=4.3-.6*Math.sin(i/20*Math.PI),y2=4.3-.6*Math.sin((i+1)/20*Math.PI);rod([x,y,z],[x,y2,z2],.013,dark);if(i%2===0)mesh(new THREE.SphereGeometry(.085,10,8),bulb,x,y-.15,z,groups.LightingRig,'FestoonBulb');}
 // Visible metre annotations belong to the model, outside the assumed footprint.
 const dimMat=mat('Dimension ink','#817f69');rod([-15,.01,11.75],[15,.01,11.75],.012,dimMat,groups.Ground,'Dimension30');for(const x of [-15,15])rod([x,.01,11.55],[x,.01,11.95],.012,dimMat,groups.Ground);
 let p=panel('30.00 m','CONCEPT SITE',2.9,.8,0,.02,11.7,groups.Ground,'#e5e0d1','#6c755f');p.rotation.x=-Math.PI/2;
 rod([15.75,.01,-11],[15.75,.01,11],.012,dimMat,groups.Ground,'Dimension22');p=panel('22.00 m','',2.4,.65,15.75,.02,0,groups.Ground,'#e5e0d1','#6c755f');p.rotation.x=-Math.PI/2;p.rotation.z=Math.PI/2;
 root.userData={templateId:'outdoor-market-30x22-v1',kind:'complete-scene-template',units:'meters',width:30,depth:22,area:660,defaultVisitors:0,vendors:0,peopleIncluded:false,stalls:12,dimensionsBasis:'Concept design assumptions; no surveyed venue or certified capacity',furnitureFootprints:footprints,aisles:AISLES,assetInstances,phaseSupport:Object.keys(PHASES),openSpots:OPEN_SPOTS,eveningSpots:EVENING_SPOTS};
 applyPhase(root,'open');return root;
}
export function applyPhase(root,phase='open'){
 if(!PHASES[phase])throw new Error(`Unknown phase ${phase}`);root.userData.currentPhase=phase;root.userData.currentVisitors=0;return {visitors:0,vendors:0};
}
export function sceneReport(root){let meshes=0,triangles=0;const materials=new Set(),textures=new Set();root.updateMatrixWorld(true);root.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});return {meshes,triangles,materials:materials.size,textures:textures.size,bounds:new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray(),visitors:0,vendors:0,stalls:root.getObjectByName('Market_Stalls').children.length,furnitureFootprints:root.userData.furnitureFootprints,aisles:root.userData.aisles,openSpots:OPEN_SPOTS,eveningSpots:EVENING_SPOTS};}
export function portableCopy(root){const copy=root.clone(true),cache=new Map(),materialCache=new Map(),textureCache=new Map();copy.traverse(o=>{if(o.material){const convert=m=>{if(materialCache.has(m))return materialCache.get(m);const c=m.clone();for(const [key,t] of Object.entries(c)){if(!t?.isTexture)continue;if(!textureCache.has(t)){const nt=t.clone();nt.userData={...t.userData,mimeType:'image/png'};textureCache.set(t,nt);}c[key]=textureCache.get(t);}materialCache.set(m,c);return c;};o.material=Array.isArray(o.material)?o.material.map(convert):convert(o.material);}if(!o.geometry)return;const source=o.geometry;if(cache.has(source)){o.geometry=cache.get(source);return;}const geometry=source.clone();for(const [name,a] of Object.entries(source.attributes)){if(a.array instanceof Float32Array)continue;const array=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)array[i*a.itemSize+c]=a[['getX','getY','getZ','getW'][c]](i);geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,a.itemSize));}if(geometry.attributes.normal)geometry.normalizeNormals();cache.set(source,geometry);o.geometry=geometry;});return copy;}
