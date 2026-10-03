import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const DEFAULT_VISITORS = 3;
export const DEFAULT_STAFF = 1;

export const ZONES = [
 {id:'arrival',n:'01',title:'入口导览',point:[-8.25,1.25,4.65],copy:'从南侧入口进入，领取展览手册。导览台之后留出停留空间，入口与右侧离场位置分开。'},
 {id:'prologue',n:'02',title:'留白之间 · 序厅',point:[-6.65,2.65,1],copy:'序厅呈现“留白之间”主题。墙后的三幅原创抽象画以色块、弧线和几何构图展开，均为虚构的展览示例。'},
 {id:'collection',n:'03',title:'雕塑之间',point:[0,1.7,2.15],copy:'四座高低不同的开放展台展示《折叠》《浮石》《回声》《层叠》。沿展台之间的通道环绕，观看材质、轮廓与负空间。'},
 {id:'ecology',n:'04',title:'风的形状',point:[.4,2.8,-4.8],copy:'铜制曲线与悬浮椭圆片构成中央抽象装置《风的形状》。讲解阶段用预设站位展示观众围绕作品停留的方式。'},
 {id:'interaction',n:'05',title:'色彩与构图',point:[6.3,1.25,-1.4],copy:'4.4 米艺术体验桌设置色板组合、触感材料和数字构图三处体验位。屏幕为静态原创作品示例。'},
 {id:'rest',n:'06',title:'停留与离场',point:[7.2,1.05,4.8],copy:'右前方两把木椅与小桌提供短暂停留、翻阅展览册的位置，之后从右侧离场。座椅与盆栽为有记录的 CC0 物料。'},
];

export const OPEN_SPOTS = [[-8.3,-4.9],[0.55,-3],[4.9,4],[-6.1,5.65],[-1.9,3.55],[3.5,2.15],[5.35,0.2],[-5.7,-2.4],[-4.65,4.6],[-7.15,3.5],[-5.7,2.6],[-8.35,2.5],[-4.55,2.9],[-3.4,1.45],[-0.3,2.75],[1.9,3.55],[0.2,1.4],[-3.5,-0.9],[-3.1,-2.5],[-1.4,0.15],[1.55,0.15],[3.55,-1.2],[0.1,-1.45],[-6.4,-4.9],[-4.45,-4.9],[-7.6,-1.45],[-0.8,-3.1],[1.95,-3.1],[4.8,-2.85],[6.4,-2.85],[8,-2.85],[6.75,0.2],[8.2,0.2],[5.65,5.55],[8.8,2.65],[3.3,5.8]];
export const PHASES = {
 setup:{clock:'08:00 — 09:30',text:'参观者尚未入场，一名工作人员完成展台与体验桌检查。',guestVisible:false},
 open:{clock:'09:30 — 16:00',text:'少量参观者分散停留在作品附近，沿导览顺序自由观看。',guestVisible:true},
 tour:{clock:'16:00 — 16:20',text:'最多 12 位参观者移动至中央艺术装置前，其余参观者继续分散观看。位置均为预设。',guestVisible:true},
 closed:{clock:'17:00 — 18:00',text:'参观者离场，一名工作人员在导览台清点整理。',guestVisible:false},
};
export function getVisitorSpots(phase='open'){
 if(phase!=='tour') return OPEN_SPOTS.map(p=>[...p]);
 const group=[];
 for(const z of [-3.25,-2.4])for(const x of [-2.7,-1.5,-.3,.9,2.1,3.3])group.push([x,z]);
 const remaining=OPEN_SPOTS.filter(p=>group.every(q=>Math.hypot(p[0]-q[0],p[1]-q[1])>=.8));
 return [...group,...remaining].slice(0,36).map(p=>[...p]);
}

function texture(draw,w=1024,h=1024){const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'),w,h);const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;return tex;}
function seeded(seed=947){return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
function stoneTexture(){return texture((c,w,h)=>{c.fillStyle='#d4d4cb';c.fillRect(0,0,w,h);const r=seeded();for(let i=0;i<20000;i++){c.fillStyle=`rgba(${r()>.5?'255,255,255':'72,75,64'},${r()*.11})`;c.fillRect(r()*w,r()*h,r()*2+1,r()*2+1);}c.strokeStyle='rgba(104,111,105,.19)';c.lineWidth=2;for(let i=0;i<4;i++){const p=i*w/4;c.beginPath();c.moveTo(p,0);c.lineTo(p,h);c.stroke();c.beginPath();c.moveTo(0,p);c.lineTo(w,p);c.stroke();}},1024,1024);}
function signTexture(title,sub='',bg='#edece2',ink='#26362e',ratio=2){return texture((c,w,h)=>{c.fillStyle=bg;c.fillRect(0,0,w,h);c.fillStyle=ink;c.textAlign='center';c.textBaseline='middle';c.font=`${Math.round(h*.39)}px "Songti SC", Georgia, serif`;c.fillText(title,w/2,h*.41,w*.88);c.font=`${Math.round(h*.115)}px -apple-system, sans-serif`;c.fillText(sub,w/2,h*.79,w*.88);},1024,Math.round(1024/ratio));}
function posterTexture(kind){return texture((c,w,h)=>{
 const bg='#eae7dd',blue='#687e8e',ochre='#ad704f',black='#2a3438',pale='#c4ccc8';c.fillStyle=bg;c.fillRect(0,0,w,h);
 if(kind===0){
  c.fillStyle=blue;c.fillRect(w*.14,h*.12,w*.44,h*.62);c.fillStyle=ochre;c.beginPath();c.arc(w*.61,h*.45,w*.24,0,Math.PI*2);c.fill();
  c.fillStyle=bg;c.fillRect(w*.08,h*.63,w*.53,h*.1);c.strokeStyle=black;c.lineWidth=14;c.beginPath();c.moveTo(w*.2,h*.83);c.lineTo(w*.79,h*.27);c.stroke();
  c.fillStyle=black;c.fillRect(w*.68,h*.74,w*.13,h*.065);
 }else if(kind===1){
  c.fillStyle=pale;c.fillRect(w*.11,h*.11,w*.78,h*.75);c.fillStyle=blue;c.beginPath();c.arc(w*.52,h*.43,w*.29,Math.PI,Math.PI*2);c.lineTo(w*.81,h*.78);c.lineTo(w*.23,h*.78);c.closePath();c.fill();
  c.fillStyle=bg;c.beginPath();c.arc(w*.52,h*.48,w*.15,Math.PI,Math.PI*2);c.lineTo(w*.67,h*.79);c.lineTo(w*.37,h*.79);c.closePath();c.fill();
  c.fillStyle=ochre;c.fillRect(w*.15,h*.64,w*.25,h*.15);c.strokeStyle=black;c.lineWidth=7;c.beginPath();c.moveTo(w*.1,h*.4);c.bezierCurveTo(w*.4,h*.17,w*.9,h*.58,w*.87,h*.84);c.stroke();
 }else{
  c.fillStyle=ochre;c.fillRect(w*.13,h*.15,w*.24,h*.57);c.fillStyle=black;c.fillRect(w*.48,h*.24,w*.12,h*.59);c.fillStyle=blue;c.fillRect(w*.66,h*.11,w*.19,h*.59);
  c.strokeStyle=bg;c.lineWidth=32;c.beginPath();c.moveTo(w*.08,h*.55);c.bezierCurveTo(w*.3,h*.87,w*.72,h*.16,w*.92,h*.48);c.stroke();
  c.strokeStyle=black;c.lineWidth=5;c.beginPath();c.arc(w*.4,h*.38,w*.23,Math.PI*.55,Math.PI*1.85);c.stroke();
 }
},768,1024);}

const PERSON_MATERIALS = new Map();
function personMat(color){if(!PERSON_MATERIALS.has(color)){const m=new THREE.MeshStandardMaterial({color,roughness:.86});m.name=`Figure_${color.replace('#','')}`;PERSON_MATERIALS.set(color,m);}return PERSON_MATERIALS.get(color);}
export function makeVisitor(index,isStaff=false){
 const group=new THREE.Group();group.name=isStaff?`Staff_${String(index+1).padStart(2,'0')}`:`Visitor_${String(index+1).padStart(2,'0')}`;
 const clothes=['#596f65','#d0c7b2','#a27d5b','#798177','#e0d9cc','#3f5556','#b8a98c','#8f7762'];
 const skin=['#bd9675','#d6b18e','#916a50','#ccaa84'];const torso=personMat(isStaff?'#334c40':clothes[index%clothes.length]),skinM=personMat(skin[index%4]),pants=personMat(index%3===0?'#414c48':'#a4a393'),shoe=personMat('#333c35');
 function add(geo,m,pos,name){const o=new THREE.Mesh(geo,m);o.name=name;o.position.set(...pos);o.castShadow=true;o.receiveShadow=true;group.add(o);return o;}
 add(new THREE.CapsuleGeometry(.138,.34,4,10),torso,[0,1.17,0],'Torso');add(new THREE.SphereGeometry(.112,12,10),skinM,[0,1.57,0],'Head');
 const hair=add(new THREE.SphereGeometry(.115,12,8,0,Math.PI*2,0,Math.PI*.48),personMat(index%4===0?'#91816b':'#3e3a32'),[0,1.592,-.012],'Hair');hair.rotation.x=-.2;
 add(new THREE.CylinderGeometry(.049,.053,.09,10),skinM,[0,1.435,0],'Neck');
 for(const s of [-1,1]){add(new THREE.CapsuleGeometry(.053,.58,3,8),pants,[s*.075,.455,0],'Leg');add(new THREE.BoxGeometry(.105,.085,.2),shoe,[s*.075,.055,.035],'Shoe');const arm=add(new THREE.CapsuleGeometry(.036,.44,3,8),torso,[s*.179,1.05,.01],'Arm');arm.rotation.z=s*.105;add(new THREE.SphereGeometry(.039,8,6),skinM,[s*.201,.795,.01],'Hand');}
 if(isStaff){add(new THREE.BoxGeometry(.072,.104,.008),personMat('#e6dfc9'),[.055,1.238,.134],'StaffBadge');const strap=add(new THREE.BoxGeometry(.018,.22,.01),personMat('#bd9d65'),[.043,1.345,.133],'Lanyard');strap.rotation.z=.11;}
 else if(index%4===0){const bag=add(new THREE.BoxGeometry(.22,.28,.09),personMat('#b6ab8c'),[-.195,.79,-.01],'CanvasBag');bag.rotation.z=.12;}
 group.scale.setScalar(.965+(index%4)*.019);group.userData={role:isStaff?'staff':'visitor',scaleReference:true,bodyRadius:.24};return group;
}

export async function buildMuseum(){
 const root=new THREE.Group();root.name='Museum_BetweenSpecies_20x14';
 const groups={};for(const key of ['Architecture','Exhibition','Lighting','Visitors','Staff']){const group=new THREE.Group();group.name=`Museum_${key}`;root.add(group);groups[key]=group;}
 const architecture=groups.Architecture,exhibition=groups.Exhibition,lighting=groups.Lighting;
 const walls=new THREE.Group();walls.name='Museum_Walls';architecture.add(walls);
 const lightRig=new THREE.Group();lightRig.name='Museum_LightRig';lighting.add(lightRig);
 const footprints=[];const mats={};
 const mat=(name,color,extras={})=>{const m=new THREE.MeshStandardMaterial({color,roughness:.78,...extras});m.name=name;mats[name]=m;return m;};
 const plaster=mat('Warm white gallery plaster','#eeece2',{roughness:.94});const stone=mat('Pale grey limestone','#e5e5df',{map:stoneTexture(),roughness:.88});
 const lightStone=mat('Light stone plinth','#dfdfd5');const black=mat('Blackened slender steel','#27322d',{metalness:.65,roughness:.34});const ink=mat('Gallery charcoal','#34414a');const moss=mat('Muted blue grey','#738593');const olive=mat('Warm neutral sculpture','#c4bdab');const amber=mat('Ochre sculpture enamel','#b27851',{roughness:.36,metalness:.18});const brass=mat('Brushed bronze details','#b99d68',{roughness:.38,metalness:.68});const wood=mat('Pale ash timber','#c6b592',{roughness:.68});const cream=mat('Ivory paper','#e9e6d9');
 const emitter=mat('Warm light diffuser','#fff1ca',{emissive:'#ffe1a1',emissiveIntensity:1.4});
 const quartz=mat('Off-white sculpture enamel','#deddd2',{roughness:.34,metalness:.11});const mineral=mat('Blue-grey sculpture stone','#5f717d',{roughness:.4,metalness:.14});
 let seq=0;
 function mesh(geometry,material,pos,parent=exhibition,name='Part'){const m=new THREE.Mesh(geometry,material);m.position.set(...pos);m.name=`${name}_${++seq}`;m.castShadow=!material.transparent;m.receiveShadow=true;parent.add(m);return m;}
 function box(w,h,d,x,y,z,m=plaster,parent=exhibition,name='Panel'){return mesh(new THREE.BoxGeometry(w,h,d),m,[x,y,z],parent,name);}
 function cyl(r,h,x,y,z,m=plaster,parent=exhibition,name='Cylinder',rTop=r,segments=36){return mesh(new THREE.CylinderGeometry(rTop,r,h,segments),m,[x,y,z],parent,name);}
 function line(a,b,r,m,parent=exhibition,name='Rod'){const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),mid=start.clone().add(end).multiplyScalar(.5);const rod=mesh(new THREE.CylinderGeometry(r,r,start.distanceTo(end),10),m,mid.toArray(),parent,name);rod.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),end.sub(start).normalize());return rod;}
 function tube(points,r,m,parent=exhibition,name='OrganicBranch'){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),24,r,7,false),m,[0,0,0],parent,name);}
 function panel(title,sub,w,h,x,y,z,bg='#edece2',color='#26362e',parent=exhibition,name='Label'){const m=new THREE.MeshStandardMaterial({map:signTexture(title,sub,bg,color,w/h),roughness:.88});m.name=`Text_${title}`;return mesh(new THREE.PlaneGeometry(w,h),m,[x,y,z],parent,name);}
 function footprint(id,x,z,width,depth,category='exhibition'){footprints.push({id,x,z,width,depth,category});}
 // The slab defines the conceptual 20 × 14 m venue footprint. Roof is omitted.
 box(20,.22,14,0,-.11,0,stone,architecture,'Floor_20m_by_14m');
 box(20,.065,.11,0,-.015,6.945,black,architecture,'FrontSlabEdge');
 box(20,4.1,.16,0,2.05,-6.92,plaster,walls,'BackWall');
 box(.16,4.1,14,-9.92,2.05,0,plaster,walls,'LeftWall');
 box(.16,1.1,14,9.92,.55,0,plaster,walls,'RightCutawayWall');
 for(const [x,w] of [[-9,2],[0,8],[9,2]])box(w,.42,.14,x,.21,6.92,plaster,walls,'FrontCutawayWall');
 box(19.7,.08,.035,0,.05,-6.81,black,walls,'ShadowSkirting');box(.035,.08,13.7,-9.81,.05,0,black,walls,'ShadowSkirting');
 for(const x of [-9,-3,3,9])box(.015,3.9,.025,x,2.03,-6.826,lightStone,walls,'WallJoint');
 // Faint gallery bands and round aisle markers make the viewing path legible.
 for(const x of [-3.65,3.65])box(.025,.006,10.9,x,.006,-.3,brass,architecture,'FloorInlay');
 for(const [x,z] of [[-6.1,6.25],[-6.1,3.8],[-3.65,2.6],[-3.65,-3.4],[.4,-3.45],[3.65,-3.4],[6.3,.85],[6.3,6.3]]){cyl(.055,.008,x,.01,z,brass,architecture,'RouteDot',.055,20);}
 const arrivalFloor=panel('入场  →','ENTRY / START HERE',2,.42,-6.05,.015,6.25,'#d4d4cb','#49614d',architecture,'EntryFloorSign');arrivalFloor.rotation.x=-Math.PI/2;
 const exitFloor=panel('离场  →','EXIT / SEE YOU AGAIN',2,.42,6.1,.015,6.25,'#d4d4cb','#49614d',architecture,'ExitFloorSign');exitFloor.rotation.x=-Math.PI/2;
 const dimFloor=panel('20.00 × 14.00 m','CONCEPT GALLERY / 280 m²',2.8,.5,0,.015,6.32,'#d4d4cb','#6d7567',architecture,'DimensionNote');dimFloor.rotation.x=-Math.PI/2;
 // Reception: slender counter, inset front and a physical exhibition catalogue stack.
 box(2.15,.88,.85,-8.25,.44,4.65,ink,exhibition,'OrientationCounter');box(2.23,.065,.91,-8.25,.912,4.65,lightStone,exhibition,'CounterTop');
 box(1.84,.62,.025,-8.25,.47,5.088,moss,exhibition,'CounterInset');panel('导览 / 01','INFORMATION',1.32,.28,-8.25,.5,5.11,'#738593','#f1edde');
 for(let i=0;i<7;i++)box(.25,.01,.33,-8.71,.956+i*.011,4.57,cream,exhibition,'GuideBook');
 const tablet=box(.32,.2,.025,-7.75,1.08,4.67,black,exhibition,'ReceptionTablet');tablet.rotation.x=-.4;
 footprint('orientation-counter',-8.25,4.65,2.23,.91,'furniture');
 // Sequence wall: a large physical title plane, split typography and a circular mark.
 box(4.6,2.8,.22,-6.65,1.4,1,plaster,exhibition,'PrologueWall');footprint('prologue-wall',-6.65,1,4.6,.22);
 box(4.6,.045,.26,-6.65,.03,1,black,exhibition,'ProloguePlinth');
 panel('留白之间','THE SPACE BETWEEN',3.82,.94,-6.65,2.15,1.119,'#eeece2','#31483a');
 panel('让形状、色彩与空间，彼此相遇','FORM · COLOUR · SPACE',3.73,.37,-6.65,1.37,1.121,'#eeece2','#7d816c');
 panel('当代艺术展 · 原创虚构作品','ORIGINAL CONCEPT ART / FICTIONAL EXHIBITION',3.7,.22,-6.65,.64,1.122,'#eeece2','#747b69');
 const emblem=mesh(new THREE.TorusGeometry(.21,.012,8,48),brass,[-6.65,.99,1.14],exhibition,'PrologueEmblem');
 line([-6.83,.87,1.14],[-6.47,1.12,1.14],.008,brass);line([-6.74,1.15,1.14],[-6.53,.82,1.14],.007,brass);
 // Three original abstract paintings; no real artist, title, date or collection is claimed.
 for(let i=0;i<3;i++){const x=-8.2+i*2.0;box(1.58,2.09,.06,x,2.08,-6.784,black,exhibition,'PaintingFrame');const m=mat(`Original abstract painting ${i+1}`,'#ffffff',{map:posterTexture(i)});mesh(new THREE.PlaneGeometry(1.48,1.99),m,[x,2.08,-6.748],exhibition,'OriginalAbstractPainting');panel(['构成 I · 偏移','构成 II · 间隙','构成 III · 交错'][i],'原创虚构作品 · 无真实馆藏对应',1.3,.22,x,.84,-6.73,'#eeece2','#344b3b');}
 box(6.3,.27,.55,-6.2,.135,-6.4,lightStone,exhibition,'WallStudyBase');footprint('wall-studies-base',-6.2,-6.4,6.3,.55);
 panel('02 / 色彩的秩序','COLOUR, IN CONVERSATION.',5.8,.44,-6.2,3.5,-6.826,'#eeece2','#67735e');
 // Four open sculpture plinths with staggered heights. No glass cases.
 function cabinet(id,x,z,title,sub){
   const group=new THREE.Group();group.name=`SculpturePlinth_${id}`;exhibition.add(group);const w=1.55,d=1.35,h=[.85,1.05,.72,.92][Number(id)-1];
   box(w-.1,.055,d-.1,x,.028,z,black,group,'PlinthShadowGap');
   box(w,h-.08,d,x,h/2+.04,z,lightStone,group,'OpenStonePlinth');
   box(w+.02,.025,d+.02,x,h+.0125,z,plaster,group,'PlinthTop');
   panel(title,sub,1.23,.22,x,h*.58,z+d/2+.012,'#dfdfd5','#364650',group,'ArtworkLabel');
   footprint(`case-${id}`,x,z,w+.02,d+.02);group.userData.topOffset=h-.8;return group;
 }
 const cabinetData=[['01',-1.9,2.2,'折叠 / FOLD','原创虚构作品 · 金属形态'],['02',1.9,2.2,'浮石 / LEVITATE','原创虚构作品 · 平衡研究'],['03',-1.9,-1.2,'回声 / ECHO','原创虚构作品 · 环形关系'],['04',1.9,-1.2,'层叠 / STRATA','原创虚构作品 · 色彩与秩序']];
 const cabinets=cabinetData.map(v=>{const plinth=cabinet(...v);const artwork=new THREE.Group();artwork.name=`OriginalSculpture_${v[0]}`;artwork.position.y=plinth.userData.topOffset;plinth.add(artwork);return artwork;});
 // Fold: angular metal planes and sharp edges, openly displayed.
 for(let i=0;i<3;i++){const fold=box(.38,.58,.028,-1.9+(i-1)*.21,1.125,2.2+(i%2)*.1,i===1?amber:i===0?quartz:mineral,cabinets[0],'FoldedMetalPlane');fold.rotation.y=(i-1)*.72;fold.rotation.z=(i-1)*.12;}
 // Levitate: smooth asymmetric stone masses balanced on fine bronze supports.
 for(let i=0;i<3;i++){const x=1.9+(i-1)*.33,z=2.2+(i%2)*.14,y=.97+i*.2;line([x,.81,z],[x,y,z],.014,brass,cabinets[1],'FloatingStoneSupport');const form=mesh(new THREE.IcosahedronGeometry(.21,2),i===1?amber:i===0?quartz:mineral,[x,y,z],cabinets[1],'FloatingStone');form.scale.set(1.2,.66,.82);form.rotation.set(i*.2,i*.8,.2);}
 // Echo: crossing circular outlines, retaining visible negative space.
 for(let i=0;i<3;i++){const loop=mesh(new THREE.TorusGeometry(.29-i*.045,.026,10,64),i===1?moss:brass,[-1.9+(i-1)*.13,1.13,-1.2],cabinets[2],'EchoRing');loop.rotation.y=(i-1)*.7;}
 box(.61,.035,.34,-1.9,.822,-1.2,black,cabinets[2],'EchoBase');
 // Strata: offset horizontal colour layers with a fine registration pin.
 for(let i=0;i<7;i++){const layer=box(.63,.066,.55,1.9+Math.sin(i*1.7)*.032,.857+i*.071,-1.2,i%3===0?amber:i%2===0?lightStone:mineral,cabinets[3],'Stratum');layer.rotation.y=.09*Math.sin(i);}
 cyl(.018,.65,1.9,1.17,-1.2,brass,cabinets[3],'CorePin',.018,12);
 // Central artwork: a bronze mobile on a low oval platform with floating metal forms.
 const hero=new THREE.Group();hero.name='Artwork_Fictional_ShapeOfWind';exhibition.add(hero);
 const platform=cyl(1,.16,.4,.08,-4.8,lightStone,hero,'EllipticalIsland');platform.scale.set(1.9,1,1.05);
 const inner=cyl(1,.08,.4,.2,-4.8,plaster,hero,'InnerSculpturePlatform');inner.scale.set(1.48,1,.78);
 footprint('ecology-island',.4,-4.8,3.8,2.1);
 tube([[.45,.2,-4.82],[.45,1,-4.82],[.45,1.8,-4.82],[.45,2.75,-4.82]],.032,brass,hero,'SculptureSpine');
 for(let i=0;i<10;i++){
   const a=i*2.399,r=.72+(i%3)*.2,y=.9+i*.17;const x=.4+Math.cos(a)*r,z=-4.8+Math.sin(a)*r*.61;
   tube([[.45,y-.26,-4.82],[.4+Math.cos(a)*r*.55,y+.12,-4.8+Math.sin(a)*r*.32],[x,y+.23,z]],.018,brass,hero);
   const leaf=mesh(new THREE.SphereGeometry(.35,20,12),i%3===0?amber:i%2?brass:moss,[x,y+.24,z],hero,'SuspendedMetalForm');leaf.scale.set(1.22,.085,.57);leaf.rotation.set(.13*Math.sin(a),-a,.18*Math.cos(a));
   const dot=mesh(new THREE.SphereGeometry(.065,10,8),cream,[x,y-.07,z],hero,'SuspendedCounterweight');line([x,y+.23,z],[x,y-.07,z],.004,brass,hero,'MobileThread');
 }
 panel('风的形状','THE SHAPE OF WIND / ORIGINAL CONCEPT ART',2.9,.48,.4,3.47,-6.824,'#eeece2','#354b3b');
 const heroLabel=panel('曲线、悬浮与无声的平衡','原创虚构装置 · 无真实馆藏对应',2.65,.28,.4,.275,-3.91,'#dedfd3','#4e614c',hero);heroLabel.rotation.x=-.28;
 // A curatorial text panel sits behind the artwork and outside the viewing route.
 box(1.3,2.35,.11,4.5,1.175,-6.71,moss,exhibition,'CuratorialStoryPanel');
 panel('观看之间','BETWEEN LOOKING',1.13,.58,4.5,1.84,-6.648,'#738593','#f1edde');
 panel('形状与留白','FORM AND VOID',1.13,.28,4.5,1.27,-6.647,'#738593','#f1edde');
 panel('材料与距离','MATERIAL AND DISTANCE',1.13,.28,4.5,.8,-6.646,'#738593','#f1edde');
 footprint('ecology-story-panel',4.5,-6.71,1.3,.11);
 // Art activity table: colour and material samples plus a static digital composition.
 box(4.4,.105,1.2,6.3,.88,-1.4,wood,exhibition,'ExperienceTableTop');
 for(const x of [4.3,8.3]){box(.075,.83,.94,x,.415,-1.4,black,exhibition,'ExperienceTableLeg');}
 box(4.07,.065,.055,6.3,.27,-1.76,black,exhibition,'TableStretcher');footprint('experience-table',6.3,-1.4,4.4,1.2,'furniture');
 // Colour disks, material blocks and a static digital composition are art activities.
 for(let i=0;i<4;i++){const disk=cyl(.115,.025,4.76+(i%2)*.24,.95,-1.54+Math.floor(i/2)*.25,[moss,amber,cream,ink][i],exhibition,'ColourSwatch');}
 for(let i=0;i<3;i++){const sample=box(.2,.12+i*.035,.26,6.02+i*.29,.996+i*.018,-1.4,[wood,lightStone,brass][i],exhibition,'TouchMaterialSample');sample.rotation.y=i*.13;}
 const screen=box(.71,.035,.55,7.77,.963,-1.4,black,exhibition,'StaticTouchscreen');
 const mapMat=mat('Static digital composition','#ffffff',{map:posterTexture(0)});const screenFace=mesh(new THREE.PlaneGeometry(.64,.48),mapMat,[7.77,.983,-1.4],exhibition,'StaticScreenContent');screenFace.rotation.x=-Math.PI/2;
 for(const [x,title,sub] of [[4.95,'01 / 色彩组合','COLOUR COMPOSITION'],[6.3,'02 / 触摸材料','MATERIAL STUDY'],[7.76,'03 / 数字构图','DIGITAL COMPOSITION']]){const label=panel(title,sub,1.02,.23,x,.941,-.91,'#c6b592','#354a3a');label.rotation.x=-Math.PI/2;}
 // The open-backed right wall carries an identity panel without a bulky full-height enclosure.
 panel('05 / 色彩与构图','TRY A NEW COMPOSITION',3.9,.57,7.2,2.88,-6.825,'#eeece2','#53694e');
 for(let i=0;i<6;i++){const x=6.2+(i%3)*.65,z=-6.5+Math.floor(i/3)*.33;const form=box(.2,.22+(i%3)*.06,.19,x,.26+(i%3)*.03,z,[moss,amber,cream][i%3],exhibition,'ColourStudyBlock');form.rotation.y=i*.2;}
 box(2.9,.23,.95,7.03,.115,-6.3,lightStone,exhibition,'TouchStudyBase');footprint('touch-study-base',7.03,-6.3,2.9,.95);
 // Resting area, built from two archived CC0 props. Source materials remain intact.
 const loader=new GLTFLoader();const assets=await Promise.all(['chair','plant'].map(id=>loader.loadAsync(new URL(`./assets/models/${id}.glb`,import.meta.url).href)));
 function sourceAsset(i,x,z,height,rotation,name){
  const parent=new THREE.Group();parent.name=name;const object=assets[i].scene.clone(true);object.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());object.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));parent.add(object);parent.scale.setScalar(height/size.y);parent.position.set(x,0,z);parent.rotation.y=rotation;exhibition.add(parent);parent.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});parent.updateMatrixWorld(true);const bb=new THREE.Box3().setFromObject(parent),ss=bb.getSize(new THREE.Vector3());footprint(name,x,z,ss.x,ss.z,'furniture');return parent;
 }
 sourceAsset(0,6.15,4.55,.95,-.23,'Source_CC0_Chair_1');sourceAsset(0,8.25,4.55,.95,.23,'Source_CC0_Chair_2');
 cyl(.34,.05,7.2,.51,4.8,wood,exhibition,'RestTableTop');cyl(.035,.46,7.2,.26,4.8,black,exhibition,'RestTableStem');cyl(.24,.03,7.2,.023,4.8,black,exhibition,'RestTableBase');footprint('rest-table',7.2,4.8,.68,.68,'furniture');
 box(.25,.014,.32,7.16,.551,4.8,cream,exhibition,'RestingGuideBook');
 sourceAsset(1,-9.06,6.13,1.22,0,'Source_CC0_Plant_1');sourceAsset(1,9.08,5.98,1.28,.4,'Source_CC0_Plant_2');
 panel('停一会儿，再出发','TAKE A MOMENT',2.45,.38,7.2,.58,6.829,'#eeece2','#52664f');
 // A thin track-light skeleton signals precise exhibition lighting. It can be hidden.
 for(const x of [-7,-1.9,1.9,6.3])box(.045,.055,10.8,x,3.91,-.3,black,lightRig,'TrackLightRail');
 for(const z of [-5.65,3.2])box(16.15,.045,.04,-.35,3.91,z,black,lightRig,'RailConnector');
 const fixtures=[[-8.2,-4.9],[-6.2,-4.9],[-4.2,-4.9],[-6.65,2.1],[-1.9,2.2],[1.9,2.2],[-1.9,-1.2],[1.9,-1.2],[.4,-4.8],[4.95,-1.4],[6.3,-1.4],[7.77,-1.4]];
 for(const [x,z] of fixtures){const nearest=[-7,-1.9,1.9,6.3].reduce((a,b)=>Math.abs(x-a)<Math.abs(x-b)?a:b);if(Math.abs(x-nearest)>.001)box(Math.abs(x-nearest)+.045,.045,.04,(x+nearest)/2,3.91,z,black,lightRig,'FixtureTrackBranch');cyl(.014,.12,x,3.825,z,black,lightRig,'LampStem',.014,12);const lamp=cyl(.065,.18,x,3.686,z,black,lightRig,'TrackSpotlight',.065,18);const glassDisc=cyl(.058,.006,x,3.592,z,emitter,lightRig,'LampLens',.058,18);}
 // Six real photometric spotlights stay active when the geometric rig is hidden.
 // Child targets on -Z preserve their direction in KHR_lights_punctual export.
 const lightSpecs=[[-1.9,2.2,16,.45,1.1],[1.9,2.2,16,.45,1.1],[-1.9,-1.2,16,.45,1.1],[1.9,-1.2,16,.45,1.1],[.4,-4.8,23,.7,1.5],[6.3,-1.4,25,.79,.88]];
 lightSpecs.forEach(([x,z,intensity,angle,targetHeight],i)=>{const spot=new THREE.SpotLight('#fff1d5',intensity,7,angle,.72,2);spot.name=`Museum_ExhibitSpot_${i+1}`;spot.position.set(x,3.56,z);spot.castShadow=false;spot.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,targetHeight-3.56,0).normalize());spot.target.name=`LightTarget_${i+1}`;spot.target.position.set(0,0,-1);spot.add(spot.target);lighting.add(spot);});
 // Emissive linear wall washers are physical parts, not semantic simulation lights.
 box(18.8,.016,.065,0,3.91,-6.67,emitter,lightRig,'WallWashDiffuser');
 for(let i=0;i<DEFAULT_VISITORS;i++)groups.Visitors.add(makeVisitor(i));for(let i=0;i<DEFAULT_STAFF;i++)groups.Staff.add(makeVisitor(i,true));
 root.userData={templateId:'art-gallery-space-between-sparse-v2',kind:'complete-scene-template',title:'留白之间 / The Space Between',units:'meters',width:20,depth:14,area:280,height:4.1,defaultVisitors:DEFAULT_VISITORS,staff:DEFAULT_STAFF,visitorLimit:36,dimensionsBasis:'Concept design assumption; not a surveyed site or approved capacity',furnitureFootprints:footprints,footprints,phaseSupport:['setup','open','tour','closed'],allExhibits:'Original fictional contemporary artworks; no real artist attribution, date or collection provenance is claimed',assetRoles:['chair','plant'],source:'Two CC0 decorative furniture/plant assets from the local 3DAssets archive; all sculptures, abstract paintings, architecture and human scale markers authored for this concept.'};
 applyAttendance(root,DEFAULT_VISITORS,'open',true);return {root,footprints};
}

export function applyAttendance(root,count=DEFAULT_VISITORS,phase='open',show=true){
 const visitors=root.getObjectByName('Museum_Visitors'),staff=root.getObjectByName('Museum_Staff');if(!visitors||!staff)throw new Error('Museum figure groups are missing');
 const safePhase=PHASES[phase]?phase:'open',spots=getVisitorSpots(safePhase),limit=Math.max(0,Math.min(36,Math.round(Number(count)||0)));
 visitors.children.forEach((person,i)=>{const [x,z]=spots[i];person.position.set(x,0,z);let target;if(safePhase==='tour'&&i<12)target=[.4,-4.8];else if(x<-4.3)target=z<-1?[-6.2,-6.6]:[-6.65,1];else if(x>4.1)target=z>3?[7.2,4.8]:[6.3,-1.4];else target=z<-2?[.4,-4.8]:[x<0?-1.9:1.9,z>.9?2.2:-1.2];person.rotation.y=Math.atan2(target[0]-x,target[1]-z);person.visible=show&&PHASES[safePhase].guestVisible&&i<limit;});
 const positions=safePhase==='tour'?[[3.2,-4.1],[8.85,-5.0]]:safePhase==='closed'||safePhase==='setup'?[[-8.25,3.65],[6.3,-2.8]]:[[-8.25,3.65],[8.85,-5.0]];
 staff.children.forEach((person,i)=>{person.position.set(positions[i][0],0,positions[i][1]);person.rotation.y=safePhase==='tour'&&i===0?Math.PI/2:0;person.visible=show;});
 root.userData.currentVisitors=limit;root.userData.currentPhase=safePhase;root.userData.visibleVisitors=visitors.children.filter(v=>v.visible).length;return visitors.children.filter(v=>v.visible).length+staff.children.filter(v=>v.visible).length;
}
export function spatialReport(root,phase=root.userData.currentPhase||'open',count=root.userData.currentVisitors??DEFAULT_VISITORS){
 const spots=getVisitorSpots(phase).slice(0,count),furniture=root.userData.furnitureFootprints||[],radius=.26,conflicts=[];
 const people=spots.map((p,i)=>({id:`Visitor_${String(i+1).padStart(2,'0')}`,x:p[0],z:p[1]}));
 const staffPositions=phase==='tour'?[[3.2,-4.1],[8.85,-5]]:phase==='setup'||phase==='closed'?[[-8.25,3.65],[6.3,-2.8]]:[[-8.25,3.65],[8.85,-5]];
 if(!PHASES[phase]?.guestVisible)people.length=0;
 const staffNodes=root.getObjectByName('Museum_Staff')?.children||[];staffNodes.forEach((node,i)=>{const p=staffPositions[i];if(p)people.push({id:node.name,x:p[0],z:p[1]});});
 let minimumPersonClearance=Infinity,minimumFurnitureClearance=Infinity;
 for(const p of people){
  for(const f of furniture){const dx=Math.max(Math.abs(p.x-f.x)-f.width/2,0),dz=Math.max(Math.abs(p.z-f.z)-f.depth/2,0),gap=Math.hypot(dx,dz)-radius;minimumFurnitureClearance=Math.min(minimumFurnitureClearance,gap);if(gap<0)conflicts.push({person:p.id,footprint:f.id,clearance:gap});}
  if(Math.abs(p.x)+radius>9.84||Math.abs(p.z)+radius>6.84)conflicts.push({person:p.id,kind:'venue-boundary'});
 }
 for(let i=0;i<people.length;i++)for(let j=i+1;j<people.length;j++){const gap=Math.hypot(people[i].x-people[j].x,people[i].z-people[j].z)-2*radius;minimumPersonClearance=Math.min(minimumPersonClearance,gap);if(gap<0)conflicts.push({person:people[i].id,other:people[j].id,clearance:gap});}
 return {phase,conceptOnly:true,method:'Plan-view radius 0.26 m against axis-aligned furniture footprints; not a safety or capacity assessment',people,conflicts,minimumFurnitureClearance,minimumPersonClearance};
}
export function sceneReport(root){let meshes=0,triangles=0;const materials=new Set(),textures=new Set();root.updateMatrixWorld(true);root.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});const bounds=new THREE.Box3().setFromObject(root);return {meshes,triangles,materials:materials.size,textures:textures.size,bounds:bounds.getSize(new THREE.Vector3()).toArray(),boundsMin:bounds.min.toArray(),boundsMax:bounds.max.toArray(),furnitureFootprints:root.userData.furnitureFootprints,visitorNodes:root.getObjectByName('Museum_Visitors')?.children.length,visibleVisitorNodes:root.getObjectByName('Museum_Visitors')?.children.filter(v=>v.visible).length,staffNodes:root.getObjectByName('Museum_Staff')?.children.length,spatialChecks:Object.keys(PHASES).map(phase=>spatialReport(root,phase,root.userData.currentVisitors??DEFAULT_VISITORS))};}
export function portableCopy(root){const copy=root.clone(true),cache=new Map();copy.traverse(object=>{if(object.isSpotLight){const target=object.children.find(child=>child.name.startsWith('LightTarget_'));if(target)object.target=target;}if(!object.geometry)return;const original=object.geometry;if(cache.has(original)){object.geometry=cache.get(original);return;}const geometry=original.clone();for(const [name,a] of Object.entries(original.attributes)){if(a.array instanceof Float32Array)continue;const array=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)array[i*a.itemSize+c]=a[['getX','getY','getZ','getW'][c]](i);geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,a.itemSize));}if(geometry.attributes.normal)geometry.normalizeNormals();cache.set(original,geometry);object.geometry=geometry;});return copy;}
