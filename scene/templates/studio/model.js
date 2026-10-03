import {THREE,makeKit,texture,seeded,portableCopy as copy,report} from './scene-kit.js';

// Original concept in metres. +Y is up; the cyclorama is on the -Z side.
// Each assembled object is an independently editable named group.
export const ZONES=[
 {id:'cyc',n:'01',title:'无缝背景',copy:'6.9 米宽的连续弧形背景，配合低台与静物陈设。',point:[-1.4,.8,-3.25]},
 {id:'shoot',n:'02',title:'拍摄区',copy:'相机机位、八角柔光箱、条形柔光箱与反光板。',point:[-2.1,1.05,.45]},
 {id:'tether',n:'03',title:'联机工作台',copy:'带笔记本的移动联机车，靠近相机位置。',point:[.35,.95,2.55]},
 {id:'retouch',n:'04',title:'修图区',copy:'沿右侧布置修图显示器、数位板与工作椅。',point:[4.65,1.15,-1.6]},
 {id:'makeup',n:'05',title:'化妆区',copy:'带独立灯泡的化妆镜、台面与座椅。',point:[4.8,1.3,1.0]},
 {id:'storage',n:'06',title:'器材储存',copy:'背景纸、镜头箱、灯具和周转箱各有收纳位置。',point:[4.65,1.35,3.75]}
];

export async function buildStudio(){
 const k=makeKit({root:'Studio_Photography_12x10',prefix:'Studio',width:12,depth:10,height:4.3,id:'photography-studio-12x10-v1'});
 const {root,groups,mat,mesh,box,cyl,sphere,bar,rounded,item,label}=k;
 const m={...k.materials};
 m.concrete=mat('Studio warm concrete','#97958e',{roughness:.96,map:texture((c,w,h)=>{c.fillStyle='#cdcac3';c.fillRect(0,0,w,h);const r=seeded(19);for(let i=0;i<18000;i++){c.fillStyle=`rgba(60,53,43,${r()*.085})`;c.fillRect(r()*w,r()*h,.5+r()*1.1,.5+r()*1.1);}})});
 m.wall=mat('Warm charcoal limewash wall','#696b65',{roughness:.96});
 m.cyc=mat('Seamless matte warm taupe','#a79882',{roughness:.98,side:THREE.DoubleSide});
 m.steel=mat('Graphite steel','#343a3d',{metalness:.55,roughness:.43});
 m.equipment=mat('Camera black polymer','#181d20',{roughness:.58});
 m.silver=mat('Brushed aluminium','#b0b6b5',{metalness:.8,roughness:.3});
 m.orange=mat('Rust orange canvas','#a75839',{roughness:.95});
 m.diffuser=mat('Softbox diffusion fabric','#fbf8ed',{roughness:1,side:THREE.DoubleSide});
 m.sandbag=mat('Charcoal sandbag canvas','#3e4240',{roughness:1});
 m.screen=mat('Monitor screen','#12202a',{roughness:.32});
 m.lens=mat('Lens optical glass','#203c46',{metalness:.4,roughness:.09});
 m.bulb=mat('Vanity opal bulb','#fff5dc',{emissive:'#ffd4a0',emissiveIntensity:.4,roughness:.25});
 const footprints=[];
 function footprint(g,width,depth,extra={}){footprints.push({id:g.name,nodeName:g.name,category:g.userData.role,x:g.position.x,z:g.position.z,width,depth,...extra});}
 function group(parent,name,x=0,y=0,z=0){const g=new THREE.Group();g.name=name;g.position.set(x,y,z);parent.add(g);return g;}
 function cable(points,parent,name){const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));return mesh(new THREE.TubeGeometry(curve,40,.009,6,false),m.equipment,0,0,0,parent,name);}
 function caster(x,y,z,p){const o=cyl(.042,.027,x,y,z,m.equipment,p,'CasterWheel',16);o.rotation.z=Math.PI/2;box(.018,.05,.045,x,y+.03,z,m.silver,p,'CasterBracket');}
 function flightCase(x,y,z,w,h,d,p){rounded(w,h,d,x,y+h/2,z,m.equipment,p,'CaseShell');for(const sy of [y+.028,y+h-.028])for(const sz of [-1,1])box(w,.022,.022,x,sy,z+sz*(d/2-.016),m.silver,p,'CaseEdge');for(const sx of [-1,1])for(const sz of [-1,1])box(.028,h,.028,x+sx*(w/2-.016),y+h/2,z+sz*(d/2-.016),m.silver,p,'CaseCorner');for(const sx of [-1,1])box(.038,.07,.014,x+sx*w*.3,y+h*.55,z+d/2+.01,m.silver,p,'CaseLatch');box(w*.23,.03,.032,x,y+h*.57,z+d/2+.032,m.equipment,p,'CaseHandle');}
 function stand(p,height,spread=.6){cyl(.022,height,0,height/2,0,m.silver,p,'StandTelescopic');cyl(.032,height*.43,0,height*.215,0,m.equipment,p,'StandLower');for(const y of [.56,height*.63,height-.16]){cyl(.041,.043,0,y,0,m.equipment,p,'StandCollar',16);box(.09,.025,.029,.035,y,0,m.equipment,p,'LockKnob');}for(let j=0;j<3;j++){const a=j*Math.PI*2/3;const x=Math.sin(a)*spread,z=Math.cos(a)*spread;bar([0,.47,0],[x,.045,z],.017,m.steel,p,'TripodLeg');bar([0,.18,0],[x*.62,.23,z*.62],.012,m.silver,p,'TripodBrace');sphere(.036,.023,.05,x,.03,z,m.equipment,p,'RubberFoot');}rounded(.28,.11,.3,-.22,.085,.22,m.sandbag,p,'Sandbag');bar([-.3,.15,.2],[-.14,.15,.2],.012,m.equipment,p,'SandbagHandle');}

 // Industrial shell. Front and right elevations are intentionally cut away.
 box(12,.18,10,0,-.09,0,m.concrete,groups.Structure,'ConcreteSlab');
 for(const x of [-3,0,3])box(.012,.003,10,x,.002,0,m.grey,groups.Structure,'FloorJoint');
 for(const z of [-2.5,0,2.5])box(12,.003,.012,0,.002,z,m.grey,groups.Structure,'FloorJoint');
 box(12.28,4.3,.18,0,2.15,-5.09,m.wall,groups.Structure,'BackWall');
 box(.18,.85,10,-6.09,.425,0,m.wall,groups.Structure,'WindowSillWall');
 box(.18,.6,10,-6.09,4,0,m.wall,groups.Structure,'WindowHeadWall');
 const win=group(groups.Structure,'Studio_IndustrialWindow',-5.99,0,0);win.rotation.y=Math.PI/2;
 box(9.7,2.8,.018,0,2.25,0,m.glass,win,'WindowGlass');
 for(let x=-4.85;x<5;x+=1.2125)box(.048,2.88,.085,x,2.25,0,m.steel,win,'WindowMullion');
 for(const y of [.82,2.23,3.68])box(9.8,.048,.085,0,y,0,m.steel,win,'WindowTransom');
 for(const z of [-4.82,.05,4.82]){box(.18,4.3,.22,-5.82,2.15,z,m.steel,groups.Structure,'SteelColumn');box(.34,.035,.36,-5.82,.018,z,m.steel,groups.Structure,'ColumnBase');}
 box(.12,.14,10,-5.91,.08,0,m.steel,groups.Structure,'WindowSkirting');
 box(12.2,.12,10.15,0,4.36,0,m.wall,groups.Roof,'RoofSlab');
 for(const z of [-4.6,-.15,4.6]){box(12,.28,.1,0,4.12,z,m.steel,groups.Roof,'RoofBeamWeb');for(const y of [3.99,4.25])box(12,.03,.3,0,y,z,m.steel,groups.Roof,'RoofBeamFlange');}
 for(const x of [-3.5,0,3.5])box(.085,.085,9.7,x,3.83,0,m.steel,groups.Roof,'CeilingRail');
 const duct=cyl(.16,9.6,4.3,3.94,0,m.silver,groups.Roof,'VentilationDuct');duct.rotation.x=Math.PI/2;
 for(const z of [-3,0,3]){const ring=mesh(new THREE.TorusGeometry(.165,.01,8,32),m.steel,4.3,3.94,z,groups.Roof,'DuctSeam');ring.rotation.x=0;}
 for(const x of [-3.5,1.4,4.2])for(const z of [-2.8,2.7]){const g=item('CeilingFixture',x,z,0,'Lighting');box(1.2,.07,.12,0,3.65,0,m.steel,g,'FixtureHousing');box(1.16,.015,.09,0,3.608,0,m.light,g,'FixtureDiffuser');for(const dx of [-.45,.45])cyl(.004,.65,dx,3.975,0,m.steel,g,'SuspensionWire',6);}

 // A single smooth surface: floor, 1.2 m quarter-circle, and vertical sweep.
 const cyc=item('Cyclorama',-1.35,0,0,'Structure'),profile=[[1.35,.026],[-3.42,.026]];
 for(let i=1;i<=40;i++){const a=i*Math.PI/80;profile.push([-3.42-1.2*Math.sin(a),.026+1.2*(1-Math.cos(a))]);}profile.push([-4.62,4.06]);
 const vertices=[],indices=[];for(const [z,y]of profile)vertices.push(-3.45,y,z,3.45,y,z);
 for(let i=0;i<profile.length-1;i++){const a=i*2;indices.push(a,a+1,a+2,a+1,a+3,a+2);}
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geo.setIndex(indices);geo.computeVertexNormals();mesh(geo,m.cyc,0,0,0,cyc,'ContinuousCyclorama');
 cyc.userData.curveRadius=1.2;cyc.userData.width=6.9;
 // Paint line on the outer edge; no raised threshold in the shooting area.
 box(6.9,.002,.035,-1.35,.004,1.48,m.orange,groups.Structure,'ShootAreaFloorLine');
 for(const x of [-4.8,2.1])box(.035,.002,3.15,x,.004,3.075,m.orange,groups.Structure,'ShootAreaEdgeLine');
 const floorSign=label('SHOOT / 01','PHOTOGRAPHY STUDIO',1.5,.6,-3.65,.006,3.6,groups.Structure,'#7f7d74','#c5b89e');floorSign.rotation.x=-Math.PI/2;
 const backSign=label('STUDIO / 01','IMAGE • LIGHT • SPACE',2,.65,4.6,3.45,-4.985,groups.Structure,'#696b65','#ddd3bf');

 // Still-life set, deliberately without people or mannequins.
 const plinth=item('StylingPlinth',-1.95,-2.5);box(.78,.72,.78,0,.386,0,m.wall,plinth,'Plinth');
 const vaseMat=mat('Rust ceramic','#ba7454',{roughness:.9});cyl(.125,.27,0,.88,0,vaseMat,plinth,'VaseBody',40,.08);cyl(.08,.06,0,1.045,0,vaseMat,plinth,'VaseLip',40,.072);
 for(let j=0;j<5;j++){const a=j*1.3,xx=Math.sin(a)*.17,zz=Math.cos(a)*.09;bar([0,1.06,0],[xx,1.48+j*.025,zz],.004,m.walnut,plinth,'DriedStem');const leaf=sphere(.045,.11,.008,xx,1.37+j*.025,zz,m.orange,plinth,'DriedLeaf');leaf.rotation.z=-xx*2;}
 footprint(plinth,.8,.8);
 const low=item('RoundStylingPlinth',-.72,-2.9);cyl(.39,.36,0,.206,0,m.cyc,low,'RoundPlinth',64);sphere(.16,.21,.16,0,.597,0,m.orange,low,'StillLifeCeramic');footprint(low,.8,.8);
 const stool=item('StylingStool',-.25,-1.62);cyl(.24,.075,0,.548,0,m.orange,stool,'StoolSeat',40);for(let j=0;j<3;j++){const a=j*2*Math.PI/3;bar([Math.sin(a)*.2,.03,Math.cos(a)*.2],[Math.sin(a)*.13,.51,Math.cos(a)*.13],.025,m.wood,stool,'StoolLeg');}footprint(stool,.5,.5);

 // Softboxes are aimed in 3D, including shell, diffuser, strobe and mount.
 function softbox(role,x,z,h,radius,target,strip=false){
  const g=item(role,x,z,0,'Equipment');stand(g,h-.25,.57);const head=group(g,`${role}_Head`,0,h,0);
  head.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(target[0]-x,target[1]-h,target[2]-z).normalize());
  bar([0,-.24,0],[0,0,-.2],.024,m.steel,head,'TiltBracket');
  if(strip){box(.12,.17,.36,0,0,-.23,m.equipment,head,'Strobe');const sg=new THREE.BufferGeometry();sg.setAttribute('position',new THREE.Float32BufferAttribute([-.295,-.76,.22,.295,-.76,.22,.295,.76,.22,-.295,.76,.22,-.08,-.11,-.23,.08,-.11,-.23,.08,.11,-.23,-.08,.11,-.23],3));sg.setIndex([0,4,5,0,5,1,1,5,6,1,6,2,2,6,7,2,7,3,3,7,4,3,4,0,4,7,6,4,6,5]);sg.computeVertexNormals();mesh(sg,m.equipment,0,0,0,head,'StripboxShell');box(.55,1.48,.035,0,0,.22,m.diffuser,head,'StripDiffuser');box(.59,.035,.06,0,.76,.2,m.equipment,head,'StripRim');box(.59,.035,.06,0,-.76,.2,m.equipment,head,'StripRim');for(const xx of [-.292,.292])box(.025,1.52,.06,xx,0,.2,m.equipment,head,'StripRim');}
  else{const shell=mesh(new THREE.CylinderGeometry(radius,.14,.43,8,1,true),m.equipment,0,0,0,head,'OctaboxShell');shell.rotation.x=Math.PI/2;const diffuser=mesh(new THREE.CircleGeometry(radius*.96,8),m.diffuser,0,0,.219,head,'OctaboxDiffuser');const rim=mesh(new THREE.RingGeometry(radius*.96,radius,8),m.equipment,0,0,.221,head,'OctaboxRim');rim.material.side=THREE.DoubleSide;for(let j=0;j<8;j++){const a=j*Math.PI/4;bar([0,0,-.22],[Math.cos(a)*radius,Math.sin(a)*radius,.21],.006,m.steel,head,'SoftboxRib');}cyl(.074,.25,0,0,-.33,m.equipment,head,'StrobeBody',24).rotation.x=Math.PI/2;}
  box(.07,.07,.055,.08,-.05,-.32,m.orange,head,'StrobeControl');
  footprint(g,1.06,1.25);return g;
 }
 softbox('OctagonalSoftbox',-3.62,-.1,2.32,.65,[-1.4,1.0,-2.35]);
 softbox('StripSoftbox',.95,-.2,2.15,.45,[-1.3,1,-2.35],true);
 const reflector=item('Reflector',-4.67,-2.27,0,'Equipment');stand(reflector,1.38,.43);
 const ref=group(reflector,'ReflectorPanel',0,1.67,0);ref.rotation.y=Math.PI/3;ref.rotation.z=-.1;
 const panel=mesh(new THREE.CircleGeometry(.52,48),m.diffuser,0,0,0,ref,'ReflectorFabric');panel.scale.y=1.3;
 const hoop=mesh(new THREE.TorusGeometry(.52,.018,8,48),m.equipment,0,0,0,ref,'ReflectorRim');hoop.scale.y=1.3;footprint(reflector,.82,.98);

 const camera=item('CameraTripod',-1.45,2.6,0,'Equipment');
 for(let j=0;j<3;j++){const a=j*2*Math.PI/3;const x=Math.sin(a)*.55,z=Math.cos(a)*.55;bar([x,.035,z],[Math.sin(a)*.08,1.32,Math.cos(a)*.08],.024,m.equipment,camera,'CameraTripodLeg');bar([x*.92,.19,z*.92],[Math.sin(a)*.08,1.32,Math.cos(a)*.08],.013,m.silver,camera,'TripodLegExtension');sphere(.045,.025,.046,x,.027,z,m.equipment,camera,'TripodFoot');}
 cyl(.047,.28,0,1.36,0,m.steel,camera,'TripodCentre');rounded(.19,.065,.14,0,1.51,0,m.equipment,camera,'TripodHead');bar([.06,1.5,.02],[.17,1.36,.31],.018,m.equipment,camera,'PanHandle');
 rounded(.23,.155,.12,0,1.64,0,m.equipment,camera,'CameraBody');box(.09,.06,.05,0,1.736,-.015,m.equipment,camera,'Viewfinder');rounded(.055,.15,.13,.104,1.64,.007,m.equipment,camera,'CameraGrip');
 for(const [z,r,l]of [[-.11,.058,.12],[-.2,.066,.07],[-.248,.069,.025]])cyl(r,l,0,1.643,z,m.equipment,camera,'CameraLensBarrel',40).rotation.x=Math.PI/2;
 cyl(.057,.006,0,1.643,-.264,m.lens,camera,'LensFrontGlass',40).rotation.x=Math.PI/2;
 box(.15,.091,.003,-.025,1.645,.063,m.screen,camera,'CameraLCD');cyl(.026,.02,.066,1.733,.012,m.steel,camera,'CameraDial',24);footprint(camera,1.06,1.20);

 const cart=item('TetherCart',.22,2.6,0,'Equipment');for(const y of [.2,.89])box(.72,.045,.5,0,y,0,m.steel,cart,'CartShelf');for(const sx of [-1,1])for(const sz of [-1,1]){bar([sx*.32,.1,sz*.2],[sx*.32,.91,sz*.2],.017,m.silver,cart,'CartUpright');caster(sx*.31,.055,sz*.2,cart);}bar([-.32,1.06,-.18],[.32,1.06,-.18],.018,m.equipment,cart,'CartPushHandle');for(const x of [-.32,.32])bar([x,.9,-.18],[x,1.06,-.18],.017,m.silver,cart,'HandleUpright');flightCase(-.02,.224,0,.51,.24,.37,cart);footprint(cart,.78,.56);
 const laptop=await k.asset('laptop',.2,.915,2.62,.24,0,'TetherLaptop');footprint(laptop,.38,.29,{groundOccupancy:false,supportSurface:cart.name});
 // Tether cable follows the cart/camera side, away from the right-side aisle.
 cable([[-.1,1.66,.06],[.12,1.45,.14],[.12,.04,.31],[.65,.025,.32],[1.37,.06,.05],[1.47,.91,.12]],camera,'TetherCable');

 // Backdrop paper storage at the rear, with visible roll ends and brackets.
 const paper=item('PaperRollRack',4.63,-4.28,0,'Equipment');
 for(const x of [-1.03,1.03]){box(.05,2.8,.05,x,1.4,0,m.steel,paper,'PaperRackUpright');box(.3,.035,.52,x,.018,0,m.steel,paper,'PaperRackFoot');}
 for(let j=0;j<3;j++){const yy=.7+j*.83,pm=mat(`BackdropPaper_${j}`,['#d9c9ab','#929b90','#b87351'][j],{roughness:1});cyl(.1,1.99,0,yy,0,pm,paper,'BackdropRoll',40).rotation.z=Math.PI/2;bar([-1.08,yy,0],[1.08,yy,0],.024,m.silver,paper,'RollAxle');for(const x of [-1.03,1.03])box(.15,.035,.3,x,yy-.08,.08,m.steel,paper,'RollBracket');}
 footprint(paper,2.38,.56);

 // Retouch station faces into the room; screen contains original graphics.
 const desk=k.desk(4.95,-1.7,2.05,.78,-Math.PI/2,'RetouchDesk',m.wood);footprint(desk,.86,2.13);
 const screenTexture=texture((c,w,h)=>{c.fillStyle='#253137';c.fillRect(0,0,w,h);c.fillStyle='#4e5c63';c.fillRect(0,0,w,h*.075);c.fillStyle='#e5dfd1';c.fillRect(w*.17,h*.12,w*.62,h*.75);c.fillStyle='#b67a5a';c.beginPath();c.arc(w*.46,h*.52,w*.1,0,Math.PI*2);c.fill();c.fillStyle='#bab6aa';c.fillRect(w*.29,h*.61,w*.4,h*.16);for(let i=0;i<7;i++){c.fillStyle=i%2?'#66767b':'#849397';c.fillRect(w*.83,h*(.18+i*.09),w*.13,h*.023);}c.fillStyle='#b4c7c8';c.fillRect(w*.02,h*.15,w*.095,h*.7);},1024,640);
 const screenMat=mat('Original retouch screen','#fff',{map:screenTexture,emissive:'#fff',emissiveMap:screenTexture,emissiveIntensity:.15,roughness:.4});
 box(.76,.46,.038,-.18,1.16,-.235,m.equipment,desk,'MonitorHousing');mesh(new THREE.PlaneGeometry(.72,.415),screenMat,-.18,1.16,-.214,desk,'RetouchScreen');bar([-.18,.8,-.23],[-.18,1.03,-.23],.026,m.steel,desk,'MonitorStand');box(.28,.018,.19,-.18,.797,-.17,m.steel,desk,'MonitorBase');
 rounded(.45,.018,.16,-.2,.794,.12,m.equipment,desk,'Keyboard');for(let row=0;row<4;row++)for(let col=0;col<13;col++)box(.025,.004,.025,-.398+col*.032,.806,.064+row*.031,m.grey,desk,'KeyboardKey');rounded(.18,.013,.23,.47,.794,.08,m.equipment,desk,'PenTablet');bar([.57,.81,.03],[.6,.81,.19],.007,m.orange,desk,'TabletPen');
 box(.19,.26,.23,.77,.919,-.17,m.equipment,desk,'MonitorSpeaker');cyl(.055,.009,.77,.94,-.048,m.steel,desk,'SpeakerCone',24).rotation.x=Math.PI/2;
 const taskchair=k.chair(3.84,-1.7,Math.PI/2,'office',m.sandbag);footprint(taskchair,.68,.68);

 const vanity=k.desk(4.95,1.03,1.9,.7,-Math.PI/2,'MakeupVanity',m.white);footprint(vanity,.8,1.98);
 box(1.25,1.05,.065,0,1.43,-.28,m.steel,vanity,'MirrorFrame');
 // Neutral silver mirror material; no reflected people or panorama images.
 box(1.08,.9,.008,0,1.43,-.241,mat('Vanity mirror silver','#b4c9ca',{metalness:.84,roughness:.11}),vanity,'Mirror');
 for(const x of [-.59,.59])for(const y of [1.06,1.31,1.56,1.81])sphere(.04,.04,.04,x,y,-.215,m.bulb,vanity,'VanityBulb');
 for(const x of [-.3,0,.3])sphere(.04,.04,.04,x,1.918,-.215,m.bulb,vanity,'VanityBulb');
 rounded(.35,.08,.19,-.55,.822,.09,m.orange,vanity,'MakeupBag');cyl(.055,.12,.64,.862,.02,m.steel,vanity,'BrushCup',24);for(let j=0;j<5;j++){const x=.62+(j%3)*.018,z=.005+Math.floor(j/3)*.024;bar([x,.89,z],[x+.012,.99+j*.006,z],.004,m.walnut,vanity,'BrushHandle');sphere(.012,.018,.012,x+.012,1.0+j*.006,z,m.sandbag,vanity,'BrushTip');}
 const makeupstool=item('MakeupStool',3.9,1.04);cyl(.265,.07,0,.54,0,m.orange,makeupstool,'MakeupSeat',40);cyl(.035,.48,0,.265,0,m.silver,makeupstool,'StoolStem');cyl(.24,.035,0,.027,0,m.steel,makeupstool,'StoolBase',40);footprint(makeupstool,.55,.55);

 const rack=item('EquipmentShelving',4.65,3.88,0,'Equipment');
 for(const x of [-1.05,1.05])for(const z of [-.34,.34])box(.045,2.22,.045,x,1.11,z,m.steel,rack,'RackUpright');
 for(const y of [.18,.86,1.54,2.2])box(2.16,.045,.75,0,y,0,m.steel,rack,'RackShelf');
 flightCase(-.52,.204,0,.85,.45,.61,rack);flightCase(.53,.204,0,.83,.45,.61,rack);flightCase(-.59,.884,0,.67,.36,.55,rack);
 for(const x of [.25,.61]){cyl(.09,.18,x,.98,0,m.equipment,rack,'SpareLens',32);cyl(.095,.035,x,1.06,0,m.steel,rack,'LensFocusRing',32);}
 for(const x of [-.62,0,.62]){cyl(.115,.24,x,1.692,0,m.equipment,rack,'StoredStrobe',24).rotation.x=Math.PI/2;box(.21,.15,.25,x,1.64,0,m.equipment,rack,'StoredStrobeMount');}
 footprint(rack,2.2,.82);
 const grip=item('GripStorage',-4.9,2.55,0,'Equipment');box(.75,.055,1.35,0,.1,0,m.steel,grip,'GripCartBase');for(const z of [-.51,.51])bar([0,.13,z],[0,1.52,z],.025,m.steel,grip,'GripCartUpright');bar([0,1.52,-.51],[0,1.52,.51],.027,m.steel,grip,'GripHandle');for(let j=0;j<4;j++){const z=-.45+j*.3;bar([-.19,.14,z],[-.17,1.94,z],.016,m.silver,grip,'FoldedLightStand');for(const dx of [-.045,.045])bar([-.19,.17,z+dx],[-.17,.66,z+dx],.016,m.equipment,grip,'FoldedLeg');}for(const x of [-.3,.3])for(const z of [-.58,.58])caster(x,.049,z,grip);footprint(grip,.82,1.42);
 const casecart=item('RollingFlightCase',-3.75,4.04,0,'Equipment');flightCase(0,.11,0,.96,.49,.59,casecart);for(const x of [-.37,.37])for(const z of [-.21,.21])caster(x,.05,z,casecart);footprint(casecart,1.02,.65);
 const bench=item('EntryBench',1.3,4.15);rounded(1.7,.1,.5,0,.49,0,m.orange,bench,'BenchCushion');for(const x of [-.65,.65])box(.045,.44,.38,x,.22,0,m.steel,bench,'BenchLeg');footprint(bench,1.78,.58);
 // Keep the east-side passage clear; footprints are equipment ground occupancy.
 k.finish();root.userData.inventory=root.userData.inventory.map(v=>({id:v.name,category:v.role,nodeName:v.name,layer:v.layer}));
 Object.assign(root.userData,{width:12,depth:10,height:4.3,peopleIncluded:false,footprints,corridors:[{id:'EastSidePassage',x:2.78,z:0,width:1,depth:9.5}],editing:'Named object groups may be translated, rotated, hidden or replaced. Revalidate layout after editing.',staticScene:true});
 return root;
}

export function portableCopy(root){const out=copy(root);out.traverse(o=>{if(o.geometry?.attributes.normal)o.geometry.normalizeNormals();});return out;}
export const sceneReport=report;
