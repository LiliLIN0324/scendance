import { THREE, makeKit, texture, seeded } from './scene-kit.js';
export { portableCopy, report } from './scene-kit.js';

export async function buildBar(){
 const kit=makeKit({root:'Bar_AmberRoom_12x9',prefix:'Bar',id:'bar-amber-room-12x9-v1',width:12,depth:9,height:3.4});
 const {root,groups,materials,mat,mesh,box,cyl,sphere,bar,rounded,item,label}=kit;
 const {walnut,black,brass,glass,light,white}=materials;
 const wine=mat('Oxblood velvet','#743b3e',{roughness:.94});
 const wineDark=mat('Deep burgundy seams','#452b30',{roughness:.98});
 const wall=mat('Warm taupe mineral plaster','#b2a18a',{roughness:.97});
 const trim=mat('Dark walnut joinery','#49382c',{roughness:.61});
 const leather=mat('Saddle brown leather','#876149',{roughness:.78});
 const silver=mat('Brushed stainless steel','#aeb8b6',{metalness:.85,roughness:.3});
 const mirror=mat('Bronze mirror','#9b8b70',{metalness:.95,roughness:.14});
 const stoneMap=texture((c,w,h)=>{const r=seeded(38);c.fillStyle='#34423f';c.fillRect(0,0,w,h);for(let i=0;i<7000;i++){c.fillStyle=`rgba(233,228,202,${r()*.045})`;c.fillRect(r()*w,r()*h,1+r()*2,1+r()*2);}for(let k=0;k<10;k++){c.beginPath();let yy=r()*h;c.moveTo(0,yy);for(let x=0;x<w;x+=18){yy+=(r()-.45)*20;c.lineTo(x,yy);}c.lineWidth=.8+r()*1.7;c.strokeStyle=`rgba(209,198,166,${.12+r()*.15})`;c.stroke();}},1024,1024);
 const barStone=mat('Dark green veined stone','#8eaaa0',{map:stoneMap,roughness:.34,metalness:.05});
 const floorMap=texture((c,w,h)=>{const r=seeded(204);c.fillStyle='#b2a28a';c.fillRect(0,0,w,h);for(let i=0;i<16000;i++){c.fillStyle=`rgba(${r()>.5?'250,243,221':'68,58,44'},${r()*.07})`;c.fillRect(r()*w,r()*h,1+r()*2,1+r()*2);}c.strokeStyle='rgba(64,54,41,.18)';c.lineWidth=2;for(let i=0;i<4;i++){c.beginPath();c.moveTo(i*w/4,0);c.lineTo(i*w/4,h);c.stroke();c.beginPath();c.moveTo(0,i*h/4);c.lineTo(w,i*h/4);c.stroke();}},1024,1024);
 const floor=mat('Warm limestone floor','#d6c7ac',{map:floorMap,roughness:.81});
 const coaster=mat('Dark leather coasters','#4c3930',{roughness:.9});
 const amberGlass=mat('Amber tinted glass','#a96826',{roughness:.2,metalness:.13});
 const stemGlass=mat('Clear drinking glass','#d9cdae',{transparent:true,opacity:.22,roughness:.08,metalness:.02,side:THREE.DoubleSide,depthWrite:false});
 const iceMat=mat('Frosted ice','#dde9e4',{transparent:true,opacity:.67,roughness:.18,depthWrite:false});
 const amberDrink=mat('Amber drink','#b57c32',{roughness:.16,metalness:.04});
 const footprints=[];
 function fp(group,x,z,width,depth,floorSolid=true,allowOverlap=false,suffix=''){footprints.push({id:group.name+suffix,nodeName:group.name,role:group.userData.role,x,z,width,depth,floorSolid,allowOverlap});}
 function tube(points,r,m,parent,name='CurvedTube'){return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p))),20,r,8,false),m,0,0,0,parent,name);}
 function localBottle(parent,x,y,z,i=0,scale=1){
  const palette=['#394c32','#876023','#5b4030','#75805a','#b28b45'];const gm=mat(`TintedBottle_${i%5}`,palette[i%5],{roughness:.21,metalness:.12});
  const r=.055*scale,h=(.20+(i%3)*.02)*scale;
  cyl(r,h,x,y+h/2,z,gm,parent,'BottleBody',18,r*.94);
  const shoulder=mesh(new THREE.CylinderGeometry(.025*scale,r*.94,.045*scale,18),gm,x,y+h+.0225*scale,z,parent,'BottleShoulder');
  cyl(.024*scale,.09*scale,x,y+h+.09*scale,z,gm,parent,'BottleNeck',12);
  cyl(.026*scale,.028*scale,x,y+h+.145*scale,z,i%2?brass:black,parent,'BottleCap',12);
  const labelY=y+h*.53;box(r*1.51,.084*scale,.003,x,labelY,z+r*.98,white,parent,'BottlePaperLabel');
  box(r*.97,.012*scale,.004,x,labelY+.019*scale,z+r*1.015,i%3?brass:wine,parent,'BottleLabelRule');
 }
 function tumbler(parent,x,y,z,withDrink=true){
  const profile=[new THREE.Vector2(.059,0),new THREE.Vector2(.061,.011),new THREE.Vector2(.062,.139),new THREE.Vector2(.057,.145),new THREE.Vector2(.052,.137),new THREE.Vector2(.05,.015)];
  mesh(new THREE.LatheGeometry(profile,22),stemGlass,x,y,z,parent,'Tumbler');
  if(withDrink){cyl(.05,.065,x,y+.042,z,amberDrink,parent,'Drink',20);for(let i=0;i<3;i++){const cube=box(.036,.035,.036,x+((i%2)-.5)*.035,y+.103+i*.006,z+(i-1)*.024,iceMat,parent,'IceCube');cube.rotation.y=i*.9;}}
 }
 function wineGlass(parent,x,y,z){
  cyl(.048,.008,x,y+.004,z,stemGlass,parent,'GlassFoot',18);cyl(.006,.14,x,y+.077,z,stemGlass,parent,'GlassStem',10);
  const points=[[.009,.139],[.056,.18],[.06,.223],[.045,.267]].map(p=>new THREE.Vector2(...p));mesh(new THREE.LatheGeometry(points,20),stemGlass,x,y,z,parent,'WineGlassBowl');
 }
 function point(parent,localPosition,intensity=12,distance=6){const l=new THREE.PointLight('#ffcf91',intensity,distance,2);l.name=`${parent.name}_Point`;l.position.set(...localPosition);l.castShadow=false;parent.add(l);return l;}
 // Architecture stays within the nominal floor outline. Front and right are cut away.
 const floorGroup=item('Floor',0,0,0,'Structure');box(12,.16,9,0,-.08,0,floor,floorGroup,'FloorSlab');
 for(const x of [-5.65,5.65])box(.018,.004,8.3,x,.004,0,brass,floorGroup,'PerimeterInlay');for(const z of [-4.15,4.15])box(11.3,.004,.018,0,.004,z,brass,floorGroup,'PerimeterInlay');
 const walls=new THREE.Group();walls.name='Bar_Walls';groups.Structure.add(walls);
 box(12,3.4,.12,0,1.7,-4.44,wall,walls,'RearWall');box(.12,3.4,9,-5.94,1.7,0,wall,walls,'LeftWall');
 box(.12,.98,9,5.94,.49,0,trim,walls,'RightCutawayWall');
 for(const [x,w] of [[-4.5,3],[4.6,2.8]])box(w,.32,.12,x,.16,4.44,trim,walls,'FrontCutawayWall');
 box(11.78,.14,.032,0,.075,-4.36,trim,walls,'RearSkirting');box(.032,.14,8.8,-5.86,.075,0,trim,walls,'LeftSkirting');
 for(let z=-4.15;z<4.4;z+=.48)box(.03,1.05,.024,-5.852,.65,z,walnut,walls,'LeftWainscotBatten');box(.045,.055,8.8,-5.84,1.22,0,brass,walls,'WainscotCap');
 const ceiling=item('Ceiling',0,0,0,'Roof');box(12,.12,9,0,3.34,0,trim,ceiling,'RoofSlab');for(const x of [-4.9,-1.4,2.1,5.6])box(.085,.14,8.7,x,3.2,0,walnut,ceiling,'CeilingBatten');
 for(const z of [-3.5,3.5])box(11.5,.02,.04,0,3.205,z,light,ceiling,'CeilingCove');
 // Four mirrored bays with three lit shelves and forty-eight individually modeled bottles.
 const shelves=item('BackbarDisplay',-1.75,-4.27);
 box(7.7,2.35,.055,0,2.035,0,trim,shelves,'BackbarPanel');
 for(let b=0;b<4;b++){const x=-2.91+b*1.94;box(1.82,2.09,.021,x,2.005,.035,mirror,shelves,'BronzeMirror');for(const xx of [x-.93,x+.93])box(.045,2.34,.09,xx,2.04,.075,brass,shelves,'BayMullion');}
 for(const y of [1.39,1.98,2.57]){box(7.72,.052,.44,0,y,.21,walnut,shelves,'FloatingShelf');box(7.59,.016,.015,0,y-.035,.417,light,shelves,'ShelfLight');for(let b=0;b<4;b++)for(let j=0;j<4;j++)localBottle(shelves,-2.91+b*1.94+(j-1.5)*.36,y+.028,.235,b*9+j+Math.round(y*10),.92+(j%2)*.11);}
 box(7.8,.09,.54,0,3.23,.22,walnut,shelves,'BackbarCornice');
 label('AMBER ROOM','琥珀间 · ORIGINAL BAR CONCEPT',3.62,.38,0,3.06,.074,shelves,'#49382c','#dcc397');
 fp(shelves,-1.75,-4.05,7.8,.51,false,true);
 // Base joinery leaves physical compartments for the refrigerator and ice maker.
 const cabinetSpecs=[[-4.55,2.1],[-.81,1.06],[.35,1.1],[1.53,1.12]];
 cabinetSpecs.forEach(([x,w])=>{const g=item('BackCabinet',x,-3.88);box(w,.79,.65,0,.435,0,walnut,g,'CabinetCarcass');box(w-.12,.06,.55,0,.032,0,black,g,'RecessedPlinth');for(const s of [-1,1]){const doorW=w/2-.025;box(doorW,.69,.032,s*w/4,.46,.342,trim,g,'CabinetDoor');box(.008,.62,.008,s*w/4,.46,.363,brass,g,'DoorInlay');bar([s*.048,.44,.376],[s*.048,.64,.376],.009,brass,g,'DoorPull');}fp(g,x,-3.88,w,.71,true,false);});
 const worktop=item('BackWorktop',0,0);
 // A real opening in the top receives the sink bowl.
 box(.7,.062,.73,-5.25,.862,-3.875,barStone,worktop,'WorktopLeft');box(5.9,.062,.73,-.85,.862,-3.875,barStone,worktop,'WorktopRight');
 box(1.1,.062,.19,-4.35,.862,-4.145,barStone,worktop,'WorktopBehindSink');box(1.1,.062,.10,-4.35,.862,-3.56,barStone,worktop,'WorktopAheadOfSink');
 fp(worktop,-1.75,-3.875,7.7,.73,false,true);
 const sink=item('Sink',-4.35,-3.875,0,'Equipment');
 box(1.055,.024,.43,0,.694,0,silver,sink,'SinkBowlBase');for(const x of [-.525,.525])box(.022,.17,.45,x,.785,0,silver,sink,'BowlSide');for(const z of [-.217,.217])box(1.07,.17,.022,0,.785,z,silver,sink,'BowlSide');
 for(const x of [-.553,.553])box(.032,.026,.50,x,.894,0,silver,sink,'SinkRim');for(const z of [-.244,.244])box(1.12,.026,.032,0,.894,z,silver,sink,'SinkRim');
 cyl(.031,.009,0,.712,0,black,sink,'Drain',16);tube([[.18,.89,-.32],[.18,1.25,-.32],[.18,1.29,-.03],[.18,1.12,.005]],.018,silver,sink,'GooseneckFaucet');cyl(.035,.035,.18,.905,-.32,silver,sink,'TapFoot');bar([.32,.9,-.31],[.32,1.02,-.31],.012,silver,sink,'TapLever');fp(sink,-4.35,-3.875,1.14,.68,false,true);
 const fridge=item('BeverageFridge',-2.96,-3.875,0,'Equipment');
 box(.92,.82,.66,0,.41,0,black,fridge,'FridgeBody');box(.79,.67,.015,0,.455,.342,glass,fridge,'GlassDoor');
 for(const x of [-.432,.432])box(.043,.73,.035,x,.45,.352,silver,fridge,'DoorFrame');for(const y of [.095,.809])box(.9,.035,.035,0,y,.352,silver,fridge,'DoorFrame');
 for(const y of [.205,.485]){box(.79,.015,.53,0,y,0,silver,fridge,'ColdShelf');for(let i=0;i<4;i++)localBottle(fridge,(i-1.5)*.17,y+.015,.13,i,.67);}
 bar([.345,.32,.397],[.345,.62,.397],.013,silver,fridge,'FridgeHandle');for(let x=-.34;x<.4;x+=.065)box(.025,.053,.02,x,.05,.34,silver,fridge,'FridgeVent');fp(fridge,-2.96,-3.875,.92,.72,true,false);
 const iceMaker=item('IceMaker',-1.9,-3.875,0,'Equipment');
 box(.95,.81,.66,0,.405,0,silver,iceMaker,'IceMakerBody');box(.865,.42,.026,0,.56,.342,black,iceMaker,'IceMakerDoor');box(.78,.055,.065,0,.76,.373,silver,iceMaker,'IceMakerPull');for(let i=0;i<10;i++)box(.75,.012,.025,0,.10+i*.026,.342,black,iceMaker,'Vent');label('ICE','',.13,.065,.3,.585,.361,iceMaker,'#283238','#dadacb');fp(iceMaker,-1.9,-3.875,.95,.75,true,false);
 // The L service counter is one editable unit, with two footprint rectangles.
 const counter=item('ServiceCounter',0,0);
 box(6.4,1.005,.72,-1.9,.5025,-.95,walnut,counter,'FrontCounterCarcass');box(.72,1.005,2.55,1.26,.5025,-2.195,walnut,counter,'ReturnCarcass');
 rounded(6.63,.085,.93,-1.9,1.047,-.94,barStone,counter,'StoneFrontTop');rounded(.94,.085,2.64,1.26,1.047,-2.2,barStone,counter,'StoneReturnTop');
 box(6.31,.74,.035,-1.9,.58,-.568,trim,counter,'CounterFront');
 for(let x=-4.95;x<1.2;x+=.105)box(.028,.75,.026,x,.58,-.538,walnut,counter,'WalnutFlute');
 for(const y of [.19,.973])box(6.41,.018,.019,-1.9,y,-.515,brass,counter,'FrontBrassTrim');
 bar([-5,.225,-.264],[1.13,.225,-.264],.023,brass,counter,'GuestFootrail');for(const x of [-4.8,-3.3,-1.8,-.3,1.04]){bar([x,.23,-.55],[x,.23,-.26],.017,brass,counter,'RailBracket');cyl(.045,.015,x,.205,-.26,brass,counter,'RailFoot',16);}
 for(let z=-3.45;z<-.99;z+=.105)box(.026,.75,.028,1.643,.58,z,walnut,counter,'ReturnFlute');
 box(6.12,.09,.06,-1.9,1.01,-1.315,leather,counter,'ServiceEdge');fp(counter,-1.9,-.8,6.63,1.27,true,false,'/front');fp(counter,1.26,-2.2,.94,2.64,true,false,'/return');footprints.at(-2).allowOverlapWith=[counter.name+'/return'];footprints.at(-1).allowOverlapWith=[counter.name+'/front'];footprints.at(-2).overlapReason=footprints.at(-1).overlapReason='Intentional continuous L-counter corner junction within the same editable object.';
 // Six independent stools, with curved burgundy back shells and brass foot rings.
 for(const x of [-4.65,-3.55,-2.45,-1.35,-.25,.85]){
  const g=item('BarStool',x,.35,Math.PI);
  cyl(.274,.09,0,.785,0,wine,g,'PaddedStoolSeat',36);cyl(.264,.021,0,.73,0,walnut,g,'SeatPan',36);
  const backrest=mesh(new THREE.CylinderGeometry(.282,.282,.255,32,1,true,Math.PI/2,Math.PI),wine,0,.97,0,g,'CurvedBackShell');backrest.material.side=THREE.DoubleSide;
  for(const sx of [-1,1])for(const sz of [-1,1])bar([sx*.23,.04,sz*.215],[sx*.17,.741,sz*.17],.022,trim,g,'StoolLeg');
  const ring=mesh(new THREE.TorusGeometry(.23,.015,8,40),brass,0,.31,0,g,'StoolFootRing');ring.rotation.x=Math.PI/2;for(const sx of [-1,1])bar([sx*.24,.77,-.07],[sx*.24,1.08,-.11],.015,brass,g,'BackSupport');
  fp(g,x,.35,.62,.64);
 }
 // Three right-hand banquettes. Channel stitching is modeled, not painted on.
 for(const z of [-2.9,.15,3.1]){
  const g=item('Banquette',5.32,z,-Math.PI/2);
  rounded(2.13,.26,.82,0,.265,0,trim,g,'BenchBase');rounded(2.14,.12,.71,0,.466,.035,wine,g,'SeatCushion');
  rounded(2.14,.76,.19,0,.8,-.335,wineDark,g,'HighBackBase');
  for(let j=0;j<11;j++)rounded(.177,.688,.095,-.96+j*.192,.806,-.223,wine,g,'UpholsteryChannel');
  for(const side of [-1,1]){rounded(.11,.28,.76,side*1.025,.605,.02,wine,g,'BenchArm');box(.018,.26,.7,side*1.086,.6,.035,brass,g,'ArmTrim');}
  for(const x of [-.89,.89])for(const zz of [-.25,.25])cyl(.029,.18,x,.09,zz,brass,g,'BenchFoot',16);
  fp(g,5.32,z,.96,2.2);
  const table=item('LoungeTable',4.13,z);cyl(.47,.05,0,.7,0,barStone,table,'RoundStoneTop',48);cyl(.052,.655,0,.343,0,brass,table,'TablePedestal',24);cyl(.31,.027,0,.025,0,black,table,'TableFoot',40);fp(table,4.13,z,.96,.96);
  const setting=item('TableSetting',4.13,z,0,'Equipment');for(const [x,zz] of [[-.18,-.13],[.2,.13]]){cyl(.081,.004,x,.729,zz,coaster,setting,'Coaster',24);tumbler(setting,x,.733,zz,true);}cyl(.065,.11,0,.785,.045,amberGlass,setting,'CandleVessel',24);cyl(.049,.01,0,.838,.045,white,setting,'CandleWax',20);sphere(.009,.027,.009,0,.86,.045,light,setting,'CandleFlame');fp(setting,4.13,z,.62,.49,false,true);
 }
 // Freestanding service accessories: an ice well, two taps, POS and a blender.
 const ice=item('IceWell',-4.35,-.94,0,'Equipment');box(.54,.09,.37,0,1.138,0,black,ice,'IceTrayBody');for(const xx of [-.276,.276])box(.025,.115,.4,xx,1.15,0,silver,ice,'IceTrayRim');for(const zz of [-.194,.194])box(.56,.025,.025,0,1.196,zz,silver,ice,'IceTrayRim');for(let i=0;i<12;i++){const cube=box(.063,.055,.067,(i%4-1.5)*.09,1.182+Math.floor(i/4)*.009,(Math.floor(i/4)-1)*.085,iceMat,ice,'TrayIce');cube.rotation.y=i*.68;}fp(ice,-4.35,-.94,.59,.42,false,true);
 const taps=item('TapTower',-1.88,-1.06,0,'Equipment');cyl(.07,.33,0,1.247,0,brass,taps,'TapColumn',24);bar([-.22,1.402,0],[.22,1.402,0],.035,brass,taps,'TapCrossbar');for(const x of [-.18,.18]){tube([[x,1.4,0],[x,1.4,.15],[x,1.29,.17]],.018,brass,taps,'BeerTap');bar([x,1.405,.07],[x,1.59,.09],.018,black,taps,'TapHandle');}box(.65,.023,.35,0,1.105,.1,silver,taps,'DripTray');for(let i=0;i<8;i++)box(.014,.009,.28,-.26+i*.074,1.121,.1,black,taps,'TraySlot');fp(taps,-1.88,-1.02,.65,.4,false,true);
 const pos=item('POS',.67,-1.04,0,'Equipment');cyl(.095,.027,0,1.103,0,black,pos,'POSFoot',24);bar([0,1.11,0],[0,1.3,-.02],.028,black,pos,'POSStem');const posScreen=box(.36,.26,.027,0,1.35,.015,black,pos,'Touchscreen');posScreen.rotation.x=-.25;
 const display=label('AMBER ROOM','SERVICE',.31,.18,0,1.365,.034,pos,'#334743','#d8be8d');display.rotation.x=-.25;fp(pos,.67,-1.04,.4,.28,false,true);
 const blender=item('Blender',.27,-3.87,0,'Equipment');rounded(.24,.18,.24,0,.982,0,black,blender,'BlenderMotor');cyl(.085,.235,0,1.177,0,stemGlass,blender,'Pitcher',20,.10);cyl(.105,.026,0,1.307,0,black,blender,'PitcherLid',20);bar([.1,1.09,0],[.147,1.23,0],.009,silver,blender,'PitcherHandle');fp(blender,.27,-3.87,.32,.28,false,true);
 // Cocktail tools and clean stemware are detailed sets, editable together.
 const tools=item('CocktailTools',-.43,-1.01,0,'Equipment');cyl(.16,.012,0,1.096,0,black,tools,'ToolTray',28);cyl(.047,.205,-.06,1.206,-.01,silver,tools,'Shaker',20,.058);cyl(.048,.045,-.06,1.331,-.01,silver,tools,'ShakerCap',20,.018);cyl(.04,.06,.076,1.132,.02,brass,tools,'JiggerBottom',16,.018);cyl(.018,.055,.076,1.189,.02,brass,tools,'JiggerTop',16,.046);bar([.13,1.095,-.08],[.15,1.365,-.08],.005,silver,tools,'BarSpoon');fp(tools,-.43,-1.01,.34,.34,false,true);
 const stemware=item('StemwareRack',-5.18,-2.93,0,'Equipment');box(.51,.047,.63,0,2.48,0,walnut,stemware,'GlassRackTop');for(const [i,x] of [-.18,0,.18].entries()){bar([x,2.5,-.2],[x,3.275,-.2],.007,brass,stemware,'RackHanger');for(let j=0;j<3;j++){const hanging=new THREE.Group();hanging.name=`Bar_HangingGlass_${String(i*3+j+1).padStart(3,'0')}`;hanging.position.set(x,2.454,(j-1)*.18);hanging.rotation.z=Math.PI;stemware.add(hanging);wineGlass(hanging,0,0,0);}}fp(stemware,-5.18,-2.93,.57,.65,false,true);
 const serviceGlasses=item('CounterGlassware',-.08,-3.88,0,'Equipment');for(let i=0;i<4;i++)tumbler(serviceGlasses,(i-1.5)*.15,.895,.1,false);fp(serviceGlasses,-.08,-3.78,.64,.15,false,true);
 // Three warm pendant pools light the counter. No light casts opaque glass shadows.
 for(const x of [-4.2,-1.9,.4]){
  const g=item('Pendant',x,-.84,0,'Lighting');cyl(.077,.035,0,3.25,0,brass,g,'CeilingRose',24);cyl(.008,.65,0,2.92,0,black,g,'PendantCable',10);
  mesh(new THREE.SphereGeometry(.255,32,16,0,Math.PI*2,0,Math.PI*.52),brass,0,2.58,0,g,'BrassDome');cyl(.25,.012,0,2.568,0,light,g,'PendantDiffuser',36);cyl(.019,.15,0,2.55,0,brass,g,'Socket',12);sphere(.071,.09,.071,0,2.465,0,light,g,'Bulb');point(g,[0,2.43,0],15,6);fp(g,x,-.84,.54,.54,false,true);
 }
 for(const z of [.45,3.15]){
  const g=item('WallSconce',-5.81,z,0,'Lighting');box(.07,.34,.12,0,2.19,0,brass,g,'SconcePlate');bar([.03,2.19,0],[.25,2.19,0],.018,brass,g,'SconceArm');cyl(.11,.23,.25,2.29,0,light,g,'OpalShade',24,.07);cyl(.113,.014,.25,2.168,0,brass,g,'ShadeRim',24);point(g,[.3,2.27,0],10,5);fp(g,-5.56,z,.39,.28,false,true);
 }
 const backLight=item('BackbarLight',-1.75,-3.93,0,'Lighting');box(7.3,.032,.05,0,3.125,0,light,backLight,'BackbarCove');const spot=new THREE.SpotLight('#ffe0ae',24,7,1.08,.85,2);spot.name='Bar_BackbarLight_001_Spot';spot.position.set(0,3.05,.17);spot.castShadow=false;spot.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,-1),new THREE.Vector3(0,-1,-.16).normalize());spot.target.name='LightTarget_Backbar';spot.target.position.set(0,0,-1);spot.add(spot.target);backLight.add(spot);fp(backLight,-1.75,-3.93,7.3,.09,false,true);
 // A quietly graphic left wall and an entrance plaque finish the room.
 const wallArt=item('WallGraphic',-5.849,1.81,Math.PI/2,'Structure');box(1.05,1.22,.045,0,2.08,0,trim,wallArt,'ArtFrame');
 const artMap=texture((c,w,h)=>{c.fillStyle='#d0b38a';c.fillRect(0,0,w,h);c.fillStyle='#713b3c';c.beginPath();c.arc(w*.49,h*.43,w*.3,0,Math.PI*2);c.fill();c.fillStyle='#334742';c.fillRect(w*.15,h*.49,w*.59,h*.25);c.strokeStyle='#d0b38a';c.lineWidth=7;c.beginPath();c.moveTo(w*.25,h*.16);c.bezierCurveTo(w*.86,h*.51,w*.3,h*.77,w*.8,h*.91);c.stroke();},512,640);
 mesh(new THREE.PlaneGeometry(.965,1.13),mat('Original bar abstract artwork','#fff',{map:artMap,roughness:.82}),0,2.08,.026,wallArt,'OriginalAbstractArt');
 const plaque=item('EntrancePlaque',-2.25,4.19,0,'Structure');const sign=label('琥珀间','AMBER ROOM',1.78,.62,0,.016,0,plaque,'#b8aa90','#5c4939');sign.rotation.x=-Math.PI/2;
 const finished=kit.finish();finished.userData.footprints=footprints;finished.userData.description='Original static contemporary bar interior with L service counter, six stools and three banquettes. No people, schedules or event simulation.';finished.userData.roofIncluded=true;finished.userData.roofDefaultPreviewVisible=false;finished.userData.externalAssets=[];finished.userData.layoutNotes='12 × 9 metre concept, 3.4 metre wall/roof height. Left/back walls full height; front/right cut away for inspection. Furniture is editable by Bar_Role_001 group. Countertop equipment intentionally sits within parent furniture footprints.';finished.userData.lightCount=6;
 return finished;
}
