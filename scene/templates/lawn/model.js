import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const ZONES = [
 {id:'stage',n:'01',title:'草坪分享台',point:[0,3.6,-6.8],copy:'8 × 3.2 米木平台，搭配主题背板、讲台和两侧音箱。平台前沿与首排之间留出空间。'},
 {id:'audience',n:'02',title:'观众与主通道',point:[0,1.1,.6],copy:'两侧各 5 排、每排 6 席，上限 60 席。人数滑块同时控制人物和座椅，使用固定排位；中央铺设 1.8 米宽的步道。'},
 {id:'welcome',n:'03',title:'签到与指引',point:[-10,2.1,6.6],copy:'入口左侧完成签到和领取资料。中央步道直达观众区，横向步道连接两侧服务点。'},
 {id:'exhibition',n:'04',title:'作品交流',point:[-10,2.0,-1.0],copy:'三块独立展板与小型交流桌。来访者在开场前浏览作品，分享结束后继续讨论。'},
 {id:'lounge',n:'05',title:'遮阳休憩',point:[10,3.2,-1.0],copy:'织物遮阳棚覆盖边侧休息区，配置四把座椅、两张小桌和两组长凳。遮阳顶可关闭，便于观察布局。'},
 {id:'refreshment',n:'06',title:'茶歇与补给',point:[10,2.1,6.2],copy:'入口右侧设置饮水、轻食和分类回收。独立服务台让茶歇等候避开中央观众区。'},
];
export const SEATS=[];
for(let row=0;row<5;row++)for(let col=0;col<6;col++)for(const side of [-1,1])SEATS.push({x:side*(1.4+col*.82),z:-2.2+row*1.13,row,col,side});
export const SOCIAL_SPOTS=[];
for(const [cx,cz] of [[-9.6,2.5],[9.6,2.5],[-9.6,-3.8],[9.6,-4.9],[0,7.8]])for(let row=0;row<3;row++)for(let col=0;col<4;col++)SOCIAL_SPOTS.push([cx+(col-1.5)*.72,cz+(row-1)*.72]);
export const PHASES={
 setup:{clock:'12:00 — 14:00',text:'工作人员检查舞台、座椅和补给，观众尚未入场。',guestVisible:false},
 open:{clock:'14:00 — 14:30',text:'来访者签到、看展、交流，观众席等待开场。',guestVisible:true},
 launch:{clock:'14:30 — 16:00',text:'来访者在舞台前落座，中央通道与侧边服务区保持独立。',guestVisible:true},
 closed:{clock:'16:00 — 16:30',text:'观众离场，工作人员整理物料；画面切换为傍晚光线。',guestVisible:false},
};
function rng(seed=143){return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
function tex(draw,w=512,h=512){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function surface(base,kind){return tex((c,w,h)=>{const r=rng();c.fillStyle=base;c.fillRect(0,0,w,h);for(let i=0;i<24000;i++){c.fillStyle=`rgba(${r()>.5?'239,236,172':'30,61,27'},${r()*.16})`;if(kind==='wood')c.fillRect(r()*w,0,.35,h);else c.fillRect(r()*w,r()*h,.5+r()*1.5,1+r()*4);}});}
function signTexture(title,sub,bg='#e9e5ce',fg='#315746'){return tex((c,w,h)=>{c.fillStyle=bg;c.fillRect(0,0,w,h);c.strokeStyle=fg;c.globalAlpha=.18;for(let i=0;i<4;i++){c.beginPath();c.arc(w*.94,h*.84,h*(.36+i*.19),0,Math.PI*2);c.stroke();}c.globalAlpha=1;c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font=`${h*.29}px Georgia,"Songti SC",serif`;c.fillText(title,w/2,h*.43,w*.87);c.font=`${h*.075}px -apple-system,sans-serif`;c.fillText(sub,w/2,h*.77,w*.86);},1024,512);}

export async function buildLawn(){
 const root=new THREE.Group();root.name='Lawn_Gathering_28x20';
 const groups={};for(const name of ['Structure','Furniture','Seating','Canopies','Landscape','People','Staff']){const g=new THREE.Group();g.name=`Lawn_${name}`;root.add(g);groups[name]=g;}
 const {Structure:S,Furniture:F,Seating:Seats,Canopies:C,Landscape:L,People:P,Staff:T}=groups;
 const footprints=[];let seq=0;
 const mat=(name,color,extra={})=>Object.assign(new THREE.MeshStandardMaterial({color,roughness:.8,...extra}),{name});
 const grass=mat('Meadow grass','#a3b46d',{map:surface('#9cac69','grass'),roughness:1});grass.map.wrapS=grass.map.wrapT=THREE.RepeatWrapping;grass.map.repeat.set(12,9);
 const earth=mat('Earth cut edge','#9b9774');const oak=mat('Warm outdoor timber','#c3a472',{map:surface('#e4cda5','wood'),roughness:.7});
 const sage=mat('Forest green','#476957'),cream=mat('Unbleached canvas','#eee5cc',{side:THREE.DoubleSide}),charcoal=mat('Charcoal metal','#37443d',{metalness:.5,roughness:.45}),brass=mat('Brass detail','#b59757',{metalness:.55,roughness:.36}),paper=mat('Paper','#f5edd8'),bark=mat('Tree bark','#786749');
 const glow=mat('Festoon diffuser','#fff2bb',{emissive:'#ffc467',emissiveIntensity:.75});
 const mesh=(geometry,m,x,y,z,parent=S,name='Part')=>{const o=new THREE.Mesh(geometry,m);o.position.set(x,y,z);o.name=`${name}_${++seq}`;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
 const box=(w,h,d,x,y,z,m=oak,parent=S,name='Timber')=>mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,parent,name);
 const cyl=(r,h,x,y,z,m=oak,parent=F,name='Round')=>mesh(new THREE.CylinderGeometry(r,r,h,24),m,x,y,z,parent,name);
 const line=(a,b,r,m,parent=S,name='Rail')=>{const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va);const o=mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),m,...va.clone().add(vb).multiplyScalar(.5).toArray(),parent,name);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return o;};
 function sign(title,sub,w,h,x,y,z,bg='#e9e5ce',fg='#315746',parent=S){const m=mat(`Sign ${title}`,'#ffffff',{map:signTexture(title,sub,bg,fg)});return mesh(new THREE.PlaneGeometry(w,h),m,x,y,z,parent,'Sign');}
 const fp=(id,x,z,w,d)=>footprints.push({id,x,z,width:w,depth:d});
 box(28,.24,20,0,-.14,0,earth,S,'Ground_28m_by_20m');box(27.96,.035,19.96,0,-.002,0,grass,S,'GrassSurface');
 // Continuous low walkways: centre spine plus a cross route to the service counters.
 box(1.8,.03,13.7,0,.033,2.65,oak,S,'CentralWalkway_1_8m');box(23,.03,1.8,0,.033,6.15,oak,S,'CrossWalkway_1_8m');
 for(let z=-4;z<9.5;z+=.29)box(1.78,.006,.014,0,.052,z,earth);for(let x=-11.4;x<11.5;x+=.29)box(.014,.006,1.78,x,.052,6.15,earth);
 // Stage: the first row is more than two metres from its front edge.
 box(8,.42,3.2,0,.21,-6.3,oak,S,'Stage_8m_by_3_2m');fp('stage',0,-6.3,8,3.2);
 for(let x=-3.9;x<4;x+=.24)box(.011,.006,3.16,x,.425,-6.3,earth);
 box(7.8,2.75,.15,0,1.8,-7.83,sage,S,'MainBackdrop');sign('旷野有约','MEADOW SESSIONS  /  IDEAS UNDER THE SKY',7.5,2.45,0,1.87,-7.74,'#476957','#f0e7cd');
 box(2,.14,.38,-2,.07,-4.48,oak);box(2,.28,.34,-2,.14,-4.82,oak);fp('stage-steps',-2,-4.59,2,.61);
 box(.7,1.0,.55,2.1,.93,-6.0,sage,F,'Lectern');box(.8,.06,.64,2.1,1.46,-6.0,oak,F);sign('旷野有约','MEADOW SESSIONS',.55,.33,2.1,1.1,-5.719,'#476957','#f0e7cd',F);
 line([2.15,1.5,-5.96],[2.15,1.76,-5.96],.012,charcoal,F,'MicrophoneStand');line([2.15,1.76,-5.96],[1.94,1.78,-5.88],.022,charcoal,F,'Microphone');
 // Canvas awnings use shaped geometry; separate roofs can be hidden for layout reading.
 function canopy(cx,cz,w,d,h){for(const x of [-1,1])for(const z of [-1,1]){cyl(.055,h,cx+x*w/2,h/2,cz+z*d/2,oak,S,'CanopyPost');box(.4,.08,.4,cx+x*w/2,.04,cz+z*d/2,earth);}
  const v=new Float32Array([cx-w/2,h,cz-d/2,cx+w/2,h,cz-d/2,cx+w/2,h,cz+d/2,cx-w/2,h,cz+d/2,cx,h+.65,cz]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(v,3));g.setIndex([0,1,4,1,2,4,2,3,4,3,0,4]);g.computeVertexNormals();mesh(g,cream,0,0,0,C,'CanvasCanopy');for(let i=0;i<4;i++){const a=[...v.slice(i*3,i*3+3)],b=[...v.slice(((i+1)%4)*3,((i+1)%4)*3+3)];line(a,b,.025,oak,C,'CanvasEdge');}}
 canopy(0,-6.35,8.9,3.8,3.65);canopy(10,-.65,5.1,5.0,3.0);
 // Welcome and refreshment stations at the front edge, clear of the cross walkway.
 function counter(x,z,title,sub){box(3.4,.88,.72,x,.44,z,sage,F,'ServiceCounter');box(3.52,.07,.84,x,.915,z,oak,F,'CounterTop');sign(title,sub,2.8,.5,x,.5,z+.366,'#476957','#f5efd9',F);fp(title,x,z,3.52,.84);for(let k=0;k<23;k++)box(.025,.74,.025,x-1.58+k*.142,.44,z+.382,oak,F);}
 counter(-10,8.4,'从这里开始','HELLO / CHECK IN');counter(10,8.4,'喝一杯，再出发','WATER / COFFEE / REFILL');
 for(const x of [-11.7,-8.3,8.3,11.7])cyl(.035,2.65,x,1.325,8.64,oak,S,'ServiceSignPost');
 sign('你好，旷野','WELCOME TO MEADOW SESSIONS',3.6,.62,-10,2.4,8.68);sign('慢一点，补点能量','TAKE A BREAK',3.6,.62,10,2.4,8.68);
 for(let i=0;i<5;i++){box(.22,.016,.3,-11.2+i*.3,.967,8.35,paper,F,'CheckinCard');cyl(.045,.09,9+i*.24,1.01,8.36,paper,F,'Cup');}
 for(const x of [10.7,11.15]){cyl(.16,.35,x,1.12,8.3,charcoal,F,'Thermos');cyl(.165,.035,x,1.31,8.3,brass,F);}
 for(const x of [12.5,13.2]){box(.43,.65,.43,x,.325,7.4,sage,F,'RecyclingBin');box(.4,.04,.4,x,.68,7.4,cream,F);fp('recycling',x,7.4,.5,.5);}
 // Exhibition side: three project panels and a small communal work surface.
 for(let i=0;i<3;i++){const x=-12.1+i*1.88;box(1.45,1.62,.08,x,1.39,-1.2,cream,F,'ProjectPanel');sign(['先看见','再连接','一起创造'][i],['01 / NOTICE','02 / CONNECT','03 / CREATE'][i],1.39,1.54,x,1.39,-1.151,'#eae4cd','#476957',F);for(const dx of [-.52,.52]){box(.045,1.05,.045,x+dx,.53,-1.2,oak,F);box(.12,.05,.65,x+dx,.025,-1.2,oak,F);}fp(`display-${i}`,x,-1.2,1.5,.7);}
 box(3.5,.08,.7,-10,.77,.7,oak,F,'ExhibitionTable');for(const x of [-11.5,-8.5])box(.06,.72,.55,x,.36,.7,charcoal,F);fp('exhibition-table',-10,.7,3.5,.7);
 for(let i=0;i<4;i++)box(.45,.018,.3,-11.25+i*.79,.821,.7,paper,F,'ProjectCards');
 // Open-air lounge: physical furniture stays inside the roof footprint.
 for(const z of [-2.15,.85]){box(2.7,.095,.6,10,.47,z,oak,F,'GardenBench');for(const x of [8.95,11.05])box(.08,.42,.45,x,.21,z,charcoal,F);fp('bench',10,z,2.7,.6);}
 for(const z of [-1.2,.05]){cyl(.37,.045,10,.51,z,oak,F,'LoungeTable');cyl(.04,.5,10,.25,z,charcoal,F);cyl(.24,.04,10,.02,z,charcoal,F);fp('lounge-table',10,z,.78,.78);}
 // Tree crowns are authored cluster geometry. Their trunks stay at the perimeter.
 const random=rng(76),leafMats=['#627b40','#80974f','#91a45c','#516d3b'].map((c,i)=>mat(`Leaf_${i}`,c,{roughness:1}));const crownGeo=new THREE.IcosahedronGeometry(1,2);
 for(const [i,x,z,h] of [[0,-12,-8.1,5.1],[1,-8.2,-8.5,4.3],[2,8,-8.5,4.7],[3,12.2,-7.9,5.3],[4,-12.5,-4.5,4.2],[5,12.6,-4.7,4.3]]){line([x,0,z],[x+.1,h*.77,z],.12,bark,L,'TreeTrunk');fp(`tree-trunk-${i}`,x,z,.28,.28);for(let k=0;k<18;k++){const a=random()*Math.PI*2,r=random()*1.2;const px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r,py=h-1+random()*1.05;const o=mesh(crownGeo,leafMats[k%4],px,py,pz,L,'TreeCrown');o.scale.set(.68+random()*.55,.55+random()*.55,.65+random()*.5);if(k<4)line([x,h*.45,z],[px,py-.2,pz],.035,bark,L,'TreeBranch');}}
 // Edge flower beds give the venue a planted boundary while leaving the south entry open.
 const flowerMats=['#f4ecd2','#e2bb71','#c7977b'].map((c,i)=>mat(`Wildflower_${i}`,c));
 for(const side of [-1,1])for(let i=0;i<38;i++){const x=side*(13.2+random()*.42),z=-7.7+random()*12.5,y=.22+random()*.3;line([x,0,z],[x,y,z],.012,leafMats[0],L,'FlowerStem');mesh(new THREE.SphereGeometry(.055,7,5),flowerMats[i%3],x,y,z,L,'Wildflower');}
 // Festoon lights along the two sides of the audience lawn.
 for(const x of [-6.8,6.8]){for(const z of [-4.4,4.4])cyl(.04,3.2,x,1.6,z,oak,S,'LightPost');for(let k=0;k<16;k++){const z=-4.4+k*8.8/16,z2=-4.4+(k+1)*8.8/16;const y=3.15-.45*Math.sin(k*Math.PI/16),y2=3.15-.45*Math.sin((k+1)*Math.PI/16);line([x,y,z],[x,y2,z2],.009,charcoal,S,'FestoonWire');mesh(new THREE.SphereGeometry(.054,8,6),glow,x,y-.07,z,S,'FestoonBulb');}}
 // Three archived CC0 assets, retained with source IDs; dimensions are normalized uniformly.
 const loader=new GLTFLoader(),sources=await Promise.all(['chair','plant','speaker'].map(id=>loader.loadAsync(`./assets/models/${id}.glb`)));
 function asset(i,x,y,z,h,rot=0,parent=F,name='Asset'){const group=new THREE.Group();group.name=name;const obj=sources[i].scene.clone(true);obj.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(obj),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());obj.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));group.add(obj);group.scale.setScalar(h/size.y);group.position.set(x,y,z);group.rotation.y=rot;parent.add(group);return group;}
 SEATS.forEach((p,i)=>{const o=asset(0,p.x,.022,p.z,.84,Math.PI,Seats,`AudienceChair_${String(i+1).padStart(2,'0')}`);o.userData.seatIndex=i;});
 for(const z of [-1.35,.05])for(const x of [8.7,11.3]){asset(0,x,0,z,.84,x<10?Math.PI/2:-Math.PI/2,F,'LoungeChair');fp('lounge-chair',x,z,.6,.6);}
 for(const [x,z,h] of [[-4.75,-6.2,1.75],[4.75,-6.2,1.75]]){asset(2,x,0,z,h,0,F,'PA_Speaker');fp('speaker',x,z,.7,.7);}
 for(const [x,z,h] of [[-4.7,-7.4,1.5],[4.7,-7.4,1.5],[-12.7,8.8,1.3],[12.7,8.8,1.3],[-7.3,-1.2,1.35]]){asset(1,x,0,z,h,0,F,'Planter');fp('planter-pot',x,z,.55,.55);}
 // Shared figure geometry and named joints allow a seated pose without duplicating people.
 const headGeo=new THREE.SphereGeometry(.113,12,10),torsoGeo=new THREE.CapsuleGeometry(.13,.34,4,10),limbGeo=new THREE.CapsuleGeometry(.046,.34,3,8),armGeo=new THREE.CapsuleGeometry(.037,.36,3,8),handGeo=new THREE.SphereGeometry(.04,8,6),shoeGeo=new THREE.BoxGeometry(.105,.09,.21);
 const skin=['#b88e6c','#d7b896','#967051','#cfa887'].map((c,i)=>mat(`Skin_${i}`,c)),cloth=['#d8d6c0','#7b8e73','#bf9b70','#647e78','#e9dfc4','#879899'].map((c,i)=>mat(`Cloth_${i}`,c));
 const trousers=[mat('Sand trousers','#b8b3a1'),mat('Olive trousers','#657263')];
 function person(i,isStaff=false){const g=new THREE.Group();g.name=isStaff?`Staff_${i+1}`:`Visitor_${String(i+1).padStart(2,'0')}`;(isStaff?T:P).add(g);const body=isStaff?sage:cloth[i%cloth.length],skinMat=skin[i%4];const part=(geo,m,name)=>{const o=mesh(geo,m,0,0,0,g,name);o.name=name;return o;};part(torsoGeo,body,'Torso');part(headGeo,skinMat,'Head');for(const s of [-1,1]){part(limbGeo,trousers[i%2],`Thigh_${s}`);part(limbGeo,trousers[i%2],`Shin_${s}`);part(shoeGeo,charcoal,`Shoe_${s}`);part(armGeo,body,`Arm_${s}`);part(handGeo,skinMat,`Hand_${s}`);}return g;}
 for(let i=0;i<60;i++)person(i);for(let i=0;i<4;i++)person(i,true);
 // Dimension lines outside the floor, stored separately from the usable-area definition.
 function dim(a,b){line(a,b,.008,earth,S,'Dimension');}dim([-14,-.01,10.75],[14,-.01,10.75]);for(const x of [-14,14])dim([x,-.01,10.55],[x,-.01,10.95]);dim([14.8,-.01,-10],[14.8,-.01,10]);for(const z of [-10,10])dim([14.6,-.01,z],[15,-.01,z]);
 const dx=sign('28.00 m','',2,.65,0,0,10.78,'#e5e6dc','#738266');dx.rotation.x=-Math.PI/2;const dz=sign('20.00 m','',2,.65,14.85,0,0,'#e5e6dc','#738266');dz.rotation.x=-Math.PI/2;dz.rotation.z=Math.PI/2;
 root.userData={templateId:'lawn-gathering-60-v1',kind:'complete-scene-template',width:28,depth:20,area:560,units:'meters',dimensionsBasis:'Concept only; not surveyed',defaultVisitors:60,staff:4,visitorLimit:60,seatPositions:SEATS,furnitureFootprints:footprints,aisleWidth:1.8,assetRoles:['chair','plant','speaker']};
 return root;
}

function pose(person,seated){const part=(name,x,y,z,rx=0)=>{const o=person.getObjectByName(name);if(o){o.position.set(x,y,z);o.rotation.set(rx,0,0);}};
 part('Torso',0,seated?.89:1.14,0);part('Head',0,seated?1.3:1.56,0);
 for(const s of [-1,1]){part(`Thigh_${s}`,s*.077,seated?.49:.67,seated?.16:0,seated?Math.PI/2:0);part(`Shin_${s}`,s*.077,seated?.24:.24,seated?.35:0);part(`Shoe_${s}`,s*.077,.055,seated?.39:.045);part(`Arm_${s}`,s*.175,seated?.77:1.06,seated?.16:.02,seated?-.5:0);part(`Hand_${s}`,s*.175,seated?.57:.83,seated?.27:.02);}}
export function applyAttendance(root,count=60,phase='launch',show=true){
 count=Math.max(20,Math.min(60,Math.round(count)));const people=root.getObjectByName('Lawn_People'),staff=root.getObjectByName('Lawn_Staff'),seats=root.getObjectByName('Lawn_Seating');
 people.children.forEach((p,i)=>{const seated=phase==='launch',spot=seated?[SEATS[i].x,SEATS[i].z]:SOCIAL_SPOTS[i];p.position.set(spot[0],seated?.022:0,spot[1]);p.rotation.y=seated?Math.PI:(i%2?-.65:2.5);pose(p,seated);p.visible=show&&PHASES[phase].guestVisible&&i<count;});
 seats.children.forEach((s,i)=>s.visible=i<count);
 const staffSpots=phase==='launch'?[[2.1,-6.65,.42],[-10,9.2,0],[10,9.2,0],[6.65,4.0,0]]:[[-10,9.2,0],[10,9.2,0],[-4.3,-4.7,0],[6.65,4.0,0]];
 staff.children.forEach((p,i)=>{const s=staffSpots[i];p.position.set(s[0],s[2],s[1]);p.rotation.y=0;pose(p,false);p.visible=show;});
 root.userData.currentVisitors=count;root.userData.currentPhase=phase;return people.children.filter(p=>p.visible).length+staff.children.filter(p=>p.visible).length;
}
export function sceneReport(root){let meshes=0,triangles=0;const materials=new Set(),textures=new Set();root.updateMatrixWorld(true);root.traverse(o=>{if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});return{meshes,triangles,materials:materials.size,textures:textures.size,bounds:new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray(),furnitureFootprints:root.userData.furnitureFootprints,visitorNodes:root.getObjectByName('Lawn_People')?.children.length,staffNodes:root.getObjectByName('Lawn_Staff')?.children.length};}
export function portableCopy(root){const copy=root.clone(true),cache=new Map();copy.traverse(o=>{if(!o.geometry)return;const source=o.geometry;if(cache.has(source)){o.geometry=cache.get(source);return;}const geometry=source.clone();for(const [name,a]of Object.entries(source.attributes)){if(a.array instanceof Float32Array)continue;const array=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)array[i*a.itemSize+c]=a[['getX','getY','getZ','getW'][c]](i);geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,a.itemSize));}cache.set(source,geometry);o.geometry=geometry;});return copy;}
