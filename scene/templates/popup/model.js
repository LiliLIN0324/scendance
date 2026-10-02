import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ZONES = [
  {id:'welcome',n:'01',title:'迎宾与领取',point:[-4.65,1.1,2.6],copy:'1.8 米迎宾台放在入口左侧。领取探索卡后向内浏览，等候的人可以沿左侧停留。'},
  {id:'display',n:'02',title:'产品展示',point:[-2.5,1.35,-.55],copy:'中央圆形香氛岛与后侧陈列墙组成展示区。主推系列集中在岛台，背柜展示完整系列。'},
  {id:'experience',n:'03',title:'试香体验',point:[2.9,1.18,-.45],copy:'2.4 米试香台配置试香纸、产品和小托盘。开放时自由体验，发布时围绕同一张台面介绍新品。'},
  {id:'photo',n:'04',title:'品牌拍照',point:[3.95,2.5,-3.5],copy:'圆拱、品牌字与自然绿植组成可被记住的画面。装置贴近后墙，前方留出拍摄与短暂停留的位置。'},
  {id:'lounge',n:'05',title:'停留交流',point:[-5.1,.95,.1],copy:'侧边设置两把座椅与小圆几，供短暂休息和一对一交流；这是一场以站立体验为主的快闪。'},
  {id:'checkout',n:'06',title:'选购与离场',point:[4.65,1.1,2.6],copy:'结账与礼品包装安排在入口右侧。购买后的来访者就近离场，避免折返穿过体验区。'},
];

// Explicit positions retain a clear central strip x=[-.4,1.1]. Dimensions
// describe a concept design in metres, not a surveyed venue or certified capacity.
export const OPEN_SPOTS = [
 [-4.55,1.75],[-3.2,2.0],[-2.65,2.65],[-1.65,3.15],
 [-3.85,-1.35],[-3.5,-2.05],[-2.65,-2.2],[-1.75,-2.0],[-1.0,-1.25],[-1.0,.25],[-2.0,1.05],[-3.05,1.1],
 [1.8,.65],[2.65,.65],[3.5,.65],[4.45,-.05],[2.25,-1.65],[3.15,-1.65],
 [3.5,-2.55],[4.4,-2.55],[5.2,-1.95],
 [-4.35,-.45],[-4.3,.45],
 [4.3,1.8],[5.3,1.6],[2.5,2.65],
 [-1.25,2.0],[1.75,1.75],[-4.5,-2.5],[5.2,-.9],
];
export const PHASES = {
 setup:{clock:'08:00 — 10:00',text:'来访者尚未入场，店员检查陈列、试香台与礼品包装。',guestVisible:false},
 open:{clock:'10:00 — 17:00',text:'沿入口进入，在展示、试香和拍照之间自由停留。',guestVisible:true},
 launch:{clock:'17:00 — 17:30',text:'店员在试香台介绍新品，部分来访者向体验区聚集。',guestVisible:true},
 closed:{clock:'20:00 — 21:00',text:'来访者离场，保留店员与基础照明，进行清点整理。',guestVisible:false},
};

function texture(draw,w=512,h=512){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function rng(seed=83){return()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};}
function surface(color,kind){return texture((c,w,h)=>{const r=rng();c.fillStyle=color;c.fillRect(0,0,w,h);for(let i=0;i<19000;i++){c.fillStyle=`rgba(${r()>.5?'255,255,255':'45,41,30'},${r()*.065})`;if(kind==='wood')c.fillRect(r()*w,0,.2+r()*.5,h);else c.fillRect(r()*w,r()*h,1+r()*1.4,1+r()*1.4);}},512,512);}
function signMap(title,sub='',bg='#e7e6d5',ink='#415741',size=1024){return texture((c,w,h)=>{c.fillStyle=bg;c.fillRect(0,0,w,h);c.fillStyle=ink;c.textAlign='center';c.textBaseline='middle';c.font=`${Math.round(h*.36)}px Georgia, "Songti SC", serif`;c.fillText(title,w/2,h*.42,w*.88);c.font=`${Math.round(h*.08)}px -apple-system, sans-serif`;c.fillText(sub,w/2,h*.79,w*.86);},size,size/2);}
function roundShape(w,h,r){const s=new THREE.Shape(),x=-w/2,y=-h/2;s.moveTo(x+r,y);s.lineTo(x+w-r,y);s.quadraticCurveTo(x+w,y,x+w,y+r);s.lineTo(x+w,y+h-r);s.quadraticCurveTo(x+w,y+h,x+w-r,y+h);s.lineTo(x+r,y+h);s.quadraticCurveTo(x,y+h,x,y+h-r);s.lineTo(x,y+r);s.quadraticCurveTo(x,y,x+r,y);return s;}

export async function buildPopup(){
 const root=new THREE.Group();root.name='Popup_NatureFragrance_12x8';
 const structure=new THREE.Group();structure.name='Popup_Structure';root.add(structure);
 const furniture=new THREE.Group();furniture.name='Popup_Furniture';root.add(furniture);
 const rig=new THREE.Group();rig.name='Popup_LightingRig';root.add(rig);
 const people=new THREE.Group();people.name='Popup_People';root.add(people);
 const staff=new THREE.Group();staff.name='Popup_Staff';root.add(staff);
 const footprints=[];
 const mats={};
 function mat(name,color,extra={}){const m=new THREE.MeshStandardMaterial({color,roughness:.7,...extra});m.name=name;mats[name]=m;return m;}
 const plaster=mat('Warm lime plaster','#dfdecf',{map:surface('#e8e5d8','plaster'),roughness:.91});
 const floor=mat('Warm terrazzo','#efebe0',{map:surface('#eae6db','stone'),roughness:.82});
 const wood=mat('Natural oak','#c3a578',{map:surface('#dfc398','wood'),roughness:.58});
 const green=mat('Sage green','#748164');const dark=mat('Deep olive','#334a35');const cream=mat('Warm ivory','#f2ecd9');
 const brass=mat('Brushed brass','#af9767',{metalness:.65,roughness:.32});const black=mat('Charcoal','#303832',{metalness:.45});
 const fabric=mat('Linen','#d4c7aa',{roughness:.95});const amber=mat('Amber fragrance glass','#835830',{metalness:.15,roughness:.16});
 const lamp=mat('Warm diffuser','#ffe5a0',{emissive:'#ffcb78',emissiveIntensity:.9});
 let seq=0;
 function mesh(geo,material,pos,parent=structure,name='Part'){const o=new THREE.Mesh(geo,material);o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;o.name=`${name}_${++seq}`;parent.add(o);return o;}
 function box(w,h,d,x,y,z,m=cream,p=structure,n='Panel'){return mesh(new THREE.BoxGeometry(w,h,d),m,[x,y,z],p,n);}
 function cyl(r,h,x,y,z,m=cream,p=furniture,n='Round'){return mesh(new THREE.CylinderGeometry(r,r,h,48),m,[x,y,z],p,n);}
 function rounded(w,d,h,x,y,z,m,p=furniture,n='Rounded'){const g=new THREE.ExtrudeGeometry(roundShape(w,d,Math.min(.12,w/4,d/4)),{depth:h,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.018,bevelThickness:.018,curveSegments:8});g.rotateX(-Math.PI/2);g.translate(0,-h/2,0);return mesh(g,m,[x,y,z],p,n);}
 const signMaterials=new Map();
 function panel(title,sub,w,h,x,y,z,bg='#e8e6d8',ink='#415741',p=structure){const key=JSON.stringify([title,sub,bg,ink]);if(!signMaterials.has(key)){const m=new THREE.MeshStandardMaterial({map:signMap(title,sub,bg,ink),roughness:.8});m.name=`Sign_${title}`;signMaterials.set(key,m);}return mesh(new THREE.PlaneGeometry(w,h),signMaterials.get(key),[x,y,z],p,'Sign');}
 function footprint(id,x,z,w,d){footprints.push({id,x,z,width:w,depth:d});}
 function bottle(x,y,z,scale=1,p=furniture,variant=0){const g=new THREE.Group();g.name=`FragranceBottle_${++seq}`;g.position.set(x,y,z);g.scale.setScalar(scale);p.add(g);cyl(.052,.16,0,.08,0,variant%3===0?cream:amber,g,'Bottle');cyl(.032,.04,0,.18,0,brass,g,'Neck');cyl(.039,.036,0,.216,0,dark,g,'Cap');panel('青序','FIELD NOTES',.074,.07,0,.09,.054,'#f3edda','#596049',g);return g;}
 function productTray(x,y,z){cyl(.25,.026,x,y+.013,z,wood);for(let i=0;i<3;i++)bottle(x+(i-1)*.115,y+.03,z,1.0,furniture,i);}
 // The floor perimeter is the sole dimension source for this template.
 box(12,.17,8,0,-.085,0,floor,structure,'Floor_12m_by_8m');
 box(12,.1,.07,0,.035,-3.94,brass);box(.07,.1,8,-5.94,.035,0,brass);box(.07,.1,8,5.94,.035,0,brass);
 box(12,3.45,.16,0,1.725,-4.08,plaster,structure,'RearWall');
 box(.16,3.45,8,-6.08,1.725,0,plaster,structure,'LeftWall');
 box(.12,1.12,2.25,6.03,.56,-2.87,plaster,structure,'RightLowWall');
 // Walnut skirting and fine wall joints add physical depth without filling aisles.
 box(12,.085,.035,0,.042,-3.98,wood);box(.035,.085,8,-5.98,.042,0,wood);
 for(let x=-5.65;x<6;x+=1.25)box(.012,3.3,.018,x,1.7,-3.985,cream);
 // Product wall with a fluted oak base and three floating display shelves.
 rounded(3.3,.6,.63,-3.75,.33,-3.58,wood);footprint('rear-product-base',-3.75,-3.58,3.35,.67);
 for(let x=-5.32;x<-2.12;x+=.085)box(.022,.57,.025,x,.33,-3.259,dark);
 for(const y of [.69,1.28,1.9]){box(3.3,.06,.41,-3.75,y,-3.72,wood);box(3.2,.014,.016,-3.75,y-.04,-3.51,lamp);for(let i=0;i<7;i++)bottle(-5.02+i*.42,y+.035,-3.64,1.15,furniture,i);}
 panel('青序','FIELD NOTES · BOTANICAL FRAGRANCE',2.65,.67,-3.75,2.67,-3.97);
 // The central island sits on a tactile circular rug.
 cyl(1.7,.012,-2.5,.009,-.55,fabric,furniture,'WovenRug');
 cyl(1.04,.76,-2.5,.39,-.55,green,furniture,'HeroIslandBase');
 for(let i=0;i<88;i++){const a=i*Math.PI*2/88;cyl(.017,.69,-2.5+1.04*Math.cos(a),.38,-.55+1.04*Math.sin(a),wood,furniture,'FlutedIsland');}
 cyl(1.11,.065,-2.5,.8,-.55,cream,furniture,'IslandTop');footprint('island',-2.5,-.55,2.24,2.24);
 cyl(.34,.23,-2.5,.945,-.55,wood);bottle(-2.5,1.06,-.55,1.95);productTray(-3.15,.84,-.68);productTray(-2.2,.84,.13);productTray(-1.85,.84,-.93);
 panel('01 / FOREST','GREEN TEA · CEDAR · MOSS',.44,.22,-2.53,.95,.17,'#eee7d3');
 // Rear brand story: a solid panel, rather than a false opening.
 rounded(1.78,.12,2.3,-.72,1.55,-3.86,green,structure,'BrandStory');
 panel('自然有序','FIND YOUR EVERYDAY RITUAL',1.47,.58,-.72,2.04,-3.775,'#748164','#f1eedb');
 panel('慢一点 · 闻见自己','A MOMENT IN NATURE',1.36,.35,-.72,1.44,-3.772,'#748164','#f1eedb');
 // Experience bar, with real metre dimensions and three distinct sample stations.
 rounded(2.4,.8,.1,2.9,.95,-.45,cream,furniture,'ExperienceTop');
 box(.2,.9,.6,1.93,.45,-.45,wood);box(.2,.9,.6,3.87,.45,-.45,wood);box(2.14,.22,.08,2.9,.45,-.72,wood);
 footprint('experience-bar',2.9,-.45,2.48,.88);
 for(let i=0;i<3;i++){const x=2.12+i*.77;productTray(x,1.013,-.51);box(.22,.003,.16,x,1.016,-.16,cream);for(let k=0;k<4;k++){const s=box(.013,.005,.14,x-.05+k*.03,1.022,-.15,cream);s.rotation.y=.2;}panel(`0${i+1}`,'TRY & DISCOVER',.2,.12,x,1.09,-.08);}
 // Photo arch: curved, freestanding volume and a shallow platform.
 const arch=new THREE.Shape();arch.moveTo(-1.3,0);arch.lineTo(1.3,0);arch.lineTo(1.3,1.67);arch.absarc(0,1.67,1.3,0,Math.PI,false);arch.lineTo(-1.3,0);
 const archGeo=new THREE.ExtrudeGeometry(arch,{depth:.16,bevelEnabled:true,bevelSize:.03,bevelThickness:.025,bevelSegments:3,steps:1,curveSegments:40});
 mesh(archGeo,green,[3.83,0,-3.93],structure,'PhotoArch');
 rounded(3.4,1.0,.065,3.83,.033,-3.4,wood,furniture,'PhotoPlatform');footprint('photo-platform',3.83,-3.4,3.45,1.07);
 const halo=mesh(new THREE.TorusGeometry(.84,.014,10,90),brass,[3.83,1.87,-3.69],structure,'BrassHalo');
 panel('青序','FIELD NOTES',1.68,.7,3.83,1.94,-3.64,'#748164','#f7f1db');
 panel('把自然，留在这一刻','A SMALL PAUSE, A NEW PERSPECTIVE',1.95,.34,3.83,1.16,-3.64,'#748164','#ecebd5');
 cyl(.25,.56,2.92,.33,-3.07,cream);bottle(2.92,.62,-3.07,1.4);
 // Arrival and checkout counters share a cohesive oak / linen material palette.
 for(const [x,id] of [[-4.65,'welcome'],[4.65,'checkout']]){rounded(1.8,.7,.92,x,.48,2.6,green,furniture,`${id}_counter`);rounded(1.88,.78,.065,x,.974,2.6,wood);footprint(id,x,2.6,1.93,.82);for(let i=0;i<20;i++)box(.022,.73,.015,x-.8+i*.084,.46,3.0,wood);panel(id==='welcome'?'你好，自然':'带走一份自然',id==='welcome'?'WELCOME / DISCOVERY CARD':'CHECKOUT / GIFT WRAPPING',1.3,.3,x,.6,3.015,'#748164','#f3eddd');}
 for(let i=0;i<6;i++)box(.23,.008,.16,-5.15+i*.04,1.014+i*.008,2.56,cream);
 panel('青序快闪','EXPLORE · SMELL · REMEMBER',.58,.29,-4.34,1.22,2.68);
 const tablet=box(.23,.17,.022,4.26,1.14,2.61,black);tablet.rotation.x=-.22;
 for(let i=0;i<3;i++){box(.23,.27,.14,4.64+i*.29,1.147,2.58,cream);const handle=mesh(new THREE.TorusGeometry(.06,.006,6,20,Math.PI),brass,[4.64+i*.29,1.295,2.58],furniture,'BagHandle');}
 // A small sitting edge on the left; this is a standing-first pop-up.
 cyl(.33,.036,-5.16,.58,.09,wood);cyl(.045,.56,-5.16,.28,.09,black);cyl(.25,.035,-5.16,.023,.09,black);productTray(-5.16,.61,.09);
 footprint('lounge-table',-5.16,.09,.72,.72);
 // Warm architectural light rig. Kept as a separate node for top view.
 for(const x of [-5.7,5.7]){box(.045,3.3,.045,x,1.65,-3.7,brass,rig);box(.045,3.3,.045,x,1.65,3.7,brass,rig);box(.05,.06,7.4,x,3.3,0,black,rig);}
 for(const z of [-3.7,.0,3.7])box(11.4,.055,.055,0,3.3,z,black,rig);
 for(const [x,z] of [[-2.5,-.55],[2.9,-.45],[-4.65,2.6],[4.65,2.6]]){cyl(.009,.48,x,3.06,z,brass,rig);const g=new THREE.SphereGeometry(.28,32,16,0,Math.PI*2,0,Math.PI/2);mesh(g,dark,[x,2.82,z],rig,'Pendant');cyl(.27,.012,x,2.82,z,lamp,rig,'PendantDiffuser');}
 // Entry mat and discreet embedded wayfinding. No simulated emergency exits.
 rounded(2.45,.77,.006,.35,.009,3.42,green,furniture,'EntryMat');
 const entry=panel('WELCOME','青序 · 自然香氛快闪',2.2,.58,.35,.018,3.43,'#748164','#f0efd9');entry.rotation.x=-Math.PI/2;
 const dimMat=new THREE.LineBasicMaterial({color:'#9da28c'});function dim(points){const g=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const l=new THREE.Line(g,dimMat);l.name='Dimension';structure.add(l);}
 dim([[-6,-.03,4.42],[6,-.03,4.42]]);for(const x of [-6,6])dim([[x,-.03,4.27],[x,-.03,4.57]]);
 dim([[6.48,-.03,-4],[6.48,-.03,4]]);for(const z of [-4,4])dim([[6.33,-.03,z],[6.63,-.03,z]]);
 const dx=panel('12.00 m','',1.05,.3,0,-.02,4.51,'#e5e6dc','#75816b');dx.rotation.x=-Math.PI/2;
 const dz=panel('8.00 m','',.9,.3,6.63,-.02,.0,'#e5e6dc','#75816b');dz.rotation.x=-Math.PI/2;dz.rotation.z=Math.PI/2;
 // Load archived 3DAssets models; failing to load is an error, never a stand-in.
 const loader=new GLTFLoader();const sources=await Promise.all(['plant','chair'].map(id=>loader.loadAsync(`./assets/models/${id}.glb`)));
 function asset(index,x,z,h,rot=0,name='Asset'){
   const group=new THREE.Group();group.name=name;const obj=sources[index].scene.clone(true);obj.updateMatrixWorld(true);const b=new THREE.Box3().setFromObject(obj),s=b.getSize(new THREE.Vector3()),c=b.getCenter(new THREE.Vector3());obj.position.sub(new THREE.Vector3(c.x,b.min.y,c.z));group.add(obj);group.scale.setScalar(h/s.y);group.position.set(x,0,z);group.rotation.y=rot;furniture.add(group);group.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});return group;
 }
 for(const [x,z,h] of [[-5.52,-2.8,1.6],[5.42,-3.12,1.58],[5.6,3.51,1.12],[-5.68,3.52,1.05]])asset(0,x,z,h,0,'Source_3DAssets_Plant');
 asset(1,-5.18,-.77,.88,Math.PI/2,'Source_3DAssets_Chair');asset(1,-5.18,.97,.88,Math.PI/2,'Source_3DAssets_Chair');
 for(const z of [-.77,.97])footprint('lounge-chair',-5.18,z,.56,.53);
 // Human figures are scale markers, not scanned people.
 const skins=['#b18b70','#d2b394','#986f52','#cfad88'];const clothes=['#d7d7ca','#aaa98e','#728772','#a89987','#e0d9cb','#69817e'];
 function person(i,isStaff=false){const g=new THREE.Group();g.name=isStaff?`Staff_${i+1}`:`Visitor_${String(i+1).padStart(2,'0')}`;const body=mat(`${g.name}_fabric`,isStaff?'#536b4d':clothes[i%clothes.length]);const skin=mat(`${g.name}_skin`,skins[i%skins.length]);const trousers=isStaff?dark:mat(`${g.name}_trousers`,i%2?'#989b8e':'#cbc6b5');mesh(new THREE.CapsuleGeometry(.13,.36,4,10),body,[0,1.15,0],g,'Torso');mesh(new THREE.SphereGeometry(.113,12,10),skin,[0,1.57,0],g,'Head');cyl(.052,.11,0,1.425,0,skin,g,'Neck');for(const side of [-1,1]){const leg=mesh(new THREE.CapsuleGeometry(.051,.59,3,8),trousers,[side*.077,.475,0],g,'Leg');box(.104,.09,.2,side*.077,.056,.035,dark,g,'Shoe');const arm=mesh(new THREE.CapsuleGeometry(.038,.46,3,8),body,[side*.175,1.05,.015],g,'Arm');arm.rotation.z=side*.12;mesh(new THREE.SphereGeometry(.039,8,6),skin,[side*.205,.79,.015],g,'Hand');}g.scale.setScalar(.96+(i%4)*.018);(isStaff?staff:people).add(g);return g;}
 OPEN_SPOTS.forEach((_,i)=>person(i));person(0,true);person(1,true);
 root.userData={templateId:'popup-fragrance-24-v1',kind:'complete-scene-template',units:'meters',width:12,depth:8,area:96,defaultVisitors:24,staff:2,visitorLimit:30,dimensionsBasis:'Concept dimensions, not a surveyed site',furnitureFootprints:footprints,phaseSupport:['setup','open','launch','closed'],assetRoles:['plant','chair'],source:'Two existing CC0 GLB props from 3DAssets.dev; authored architecture, counters, bottles and people.'};
 return root;
}

export function applyAttendance(root,count=24,phase='open',show=true){
 const group=root.getObjectByName('Popup_People'),staff=root.getObjectByName('Popup_Staff');
 if(!group||!staff)throw new Error('场景缺少人物分组');
 for(let i=0;i<group.children.length;i++){
   const p=group.children[i];const point=OPEN_SPOTS[i];let x=point[0],z=point[1];
   // Six arrivals join the introduction, leaving the centre aisle unobstructed.
   if(phase==='launch'&&i<6){x=1.65+(i%3)*.9;z=1.55+Math.floor(i/3);}
   // Avoid the six presentation positions already used by free-roaming visitors.
   if(phase==='launch'&&[24,25,27].includes(i)){x=OPEN_SPOTS[i===24?0:i===25?1:2][0];z=OPEN_SPOTS[i===24?0:i===25?1:2][1];}
   p.position.set(x,0,z);p.rotation.y=phase==='launch'?Math.atan2(2.9-x,-.45-z):Math.atan2((x<0?-2.5:2.9)-x,-.5-z);p.visible=show&&PHASES[phase].guestVisible&&i<count;
 }
 staff.children[0].position.set(phase==='launch'?2.9:-4.65,0,phase==='launch'?-1.2:3.3);staff.children[1].position.set(4.65,0,3.3);staff.children.forEach(p=>{p.rotation.y=Math.PI;p.visible=show;});
 root.userData.currentVisitors=count;root.userData.currentPhase=phase;
 return group.children.filter(p=>p.visible).length+staff.children.filter(p=>p.visible).length;
}

export function sceneReport(root){let meshes=0,triangles=0;const materials=new Set(),textures=new Set();root.updateMatrixWorld(true);root.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});return{meshes,triangles,materials:materials.size,textures:textures.size,bounds:new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray(),furnitureFootprints:root.userData.furnitureFootprints,visitorNodes:root.getObjectByName('Popup_People')?.children.length,staffNodes:root.getObjectByName('Popup_Staff')?.children.length};}

// Dequantize imported geometry once for portable GLB export; source files stay intact.
export function portableCopy(root){const copy=root.clone(true),cache=new Map();copy.traverse(o=>{if(!o.geometry)return;const source=o.geometry;if(cache.has(source)){o.geometry=cache.get(source);return;}const geometry=source.clone();for(const [name,a] of Object.entries(source.attributes)){if(a.array instanceof Float32Array)continue;const array=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)array[i*a.itemSize+c]=a[['getX','getY','getZ','getW'][c]](i);geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,a.itemSize));}cache.set(source,geometry);o.geometry=geometry;});return copy;}
