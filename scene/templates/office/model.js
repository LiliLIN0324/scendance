import {THREE,makeKit} from './scene-kit.js';
import {CONFIG} from './config.js';

export async function buildScene(){
 const k=makeKit(CONFIG),{root,groups,materials:m,mat,mesh,box,cyl,bar,rounded,item,label,art,desk,roundTable,chair,sofa,cup,pendant,room,windowFrame,loadAsset,place}=k;
 const floor=mat('Warm woven office carpet','#a5aca6',{roughness:1}),blue=mat('Slate blue upholstery','#6c8590',{roughness:.96}),sage=mat('Felt acoustic screen','#8c9c88',{roughness:1}),paper=mat('Paper','#f5f0df');
 room(floor,m.white);
 // Acoustic rear wall and two glazed return panels create an open cutaway.
 for(let x=-6.85;x<-1.3;x+=.14)box(.046,2.85,.052,x,1.6,-4.887,m.wood,groups.Structure,'AcousticSlat');
 windowFrame(7.005,-2.6,4.55,2.55,-Math.PI/2);windowFrame(7.005,2.65,4.55,2.55,-Math.PI/2);
 box(.18,3.3,.25,7.01,1.65,0,m.white,groups.Structure,'WindowPier');
 // Eight desks remain separate editable objects, as do their chairs and monitors.
 for(const centerZ of [-1.8,1.7])for(const x of [-4.35,-2.65])for(const side of [-1,1]){
  const z=centerZ+side*.375;desk(x,z,1.62,.70,0,'WorkDesk');
  chair(x,centerZ+side*1.11,side<0?0:Math.PI,'office',blue);
  const g=item('MonitorSet',x,centerZ+side*.19,side<0?Math.PI:0,'Equipment');
  box(.24,.018,.18,0,.796,0,m.black,g,'MonitorFoot');bar([0,.80,0],[0,1.02,0],.021,m.black,g,'MonitorStem');
  rounded(.60,.36,.035,0,1.16,0,m.black,g,'MonitorHousing');
  label('FOCUS','MAKE SPACE FOR GOOD IDEAS',.565,.326,0,1.16,.023,g,'#647d82','#f1eadd');
  rounded(.32,.015,.11,-.04,.794,.24,m.grey,g,'Keyboard');rounded(.06,.02,.09,.21,.796,.24,m.black,g,'Mouse');
  const stationery=item('DeskStationery',x-.57,z,0,'Equipment');cyl(.04,.10,0,.838,0,m.white,stationery,'PenCup');for(let n=0;n<3;n++)bar([-.012+n*.011,.82,0],[-.012+n*.011,.97,0],.003,m.black,stationery,'Pen');
 }
 for(const z of [-1.8,1.7]){const g=item('DeskDivider',-3.5,z);rounded(3.35,.32,.035,0,.946,0,sage,g,'AcousticDivider');}
 // Independent storage at the edge leaves the centre-to-entry circulation band open.
 for(const z of [-1.55,.35,2.25]){const g=item('StorageCabinet',-6.45,z);box(.67,.74,1.45,0,.37,0,m.white,g,'Cabinet');box(.72,.045,1.49,0,.762,0,m.wood,g,'Top');for(const dz of [-.43,.0,.43]){box(.015,.6,.41,.341,.39,dz,m.white,g,'Door');bar([.36,.37,dz-.06],[.36,.37,dz+.06],.009,m.black,g,'Handle');}}
 // The glass meeting room has a one-metre entry opening on its south side.
 const partition=item('MeetingPartition',1.35,-3.1,0,'Structure');box(.016,2.8,3.65,0,1.4,0,m.glass,partition,'Glass');for(const z of [-1.825,0,1.825])box(.035,2.84,.045,0,1.42,z,m.black,partition,'Frame');for(const y of [.03,2.83])box(.045,.035,3.65,0,y,0,m.black,partition,'Rail');
 for(const [x,w] of [[2.7,2.65],[6.29,1.37]]){const g=item('MeetingFrontGlass',x,-1.25,0,'Structure');box(w,2.8,.016,0,1.4,0,m.glass,g,'Glass');for(const dx of [-w/2,w/2])box(.035,2.84,.045,dx,1.42,0,m.black,g,'Frame');for(const y of [.03,2.83])box(w,.035,.045,0,y,0,m.black,g,'Rail');}
 desk(4.3,-3.13,2.9,1.08,0,'MeetingTable',m.wood);
 for(const x of [3.3,4.3,5.3])for(const s of [-1,1])chair(x,-3.13+s*.93,s<0?0:Math.PI,'meeting',blue);
 const screen=item('MeetingDisplay',4.3,-4.89,0,'Equipment');box(2.0,1.08,.065,0,1.7,0,m.black,screen,'DisplayFrame');label('把想法放在桌上','ROOM 01 / COLLABORATE',1.92,1.0,0,1.7,.04,screen,'#607785','#f4ecd8');
 label('ROOM 01','CONVERSATION / IDEAS',1.1,.37,2.8,2.28,-1.217,groups.Structure,'#e8e9df','#637571');
 const whiteboard=item('Whiteboard',6.52,-2.9,-Math.PI/2,'Equipment');box(1.4,.95,.04,0,1.4,0,m.white,whiteboard);for(const x of [-.52,.52]){bar([x,.12,0],[x,1.45,0],.018,m.black,whiteboard);bar([x,.07,-.25],[x,.07,.25],.018,m.black,whiteboard);}for(let i=0;i<4;i++)box(.13,.1,.004,-.47+i*.27,1.52,.025,[sage,blue,m.wood,m.grey][i],whiteboard,'Note');
 // Small pantry with books, mugs and a coffee appliance.
 const pantry=item('PantryCabinet',-3.8,-4.5);box(3.5,.85,.73,0,.425,0,m.white,pantry);box(3.6,.045,.8,0,.88,0,m.wood,pantry);for(let x=-1.5;x<1.6;x+=.5){box(.009,.75,.015,x,.43,.373,m.grey,pantry);box(.12,.016,.018,x+.18,.72,.388,m.black,pantry);}
 const coffee=item('CoffeeMachine',-4.8,-4.43,0,'Equipment');rounded(.42,.41,.33,0,1.11,0,m.black,coffee);box(.32,.17,.023,0,1.11,.175,m.grey,coffee);box(.36,.025,.17,0,.922,.24,m.black,coffee);cup(0,.938,.24,coffee);
 for(let i=0;i<3;i++)cup(-3.75+i*.23,.91,-4.33,pantry.parent);
 for(const y of [1.55,2.1]){box(3.5,.045,.24,-3.8,y,-4.74,m.wood);for(let i=0;i<6;i++){const g=item('ArchiveBook',-4.95+i*.19,-4.76);box(.06,.25+(i%3)*.035,.17,0,y+.16,0,[blue,sage,m.white][i%3],g);}}
 const printer=item('Printer',-6.45,2.25,0,'Equipment');rounded(.49,.24,.46,0,.905,0,m.white,printer);box(.41,.025,.32,0,1.043,-.015,m.grey,printer);box(.32,.022,.16,0,.87,.28,m.black,printer);
 // Lounge and reception are at the glazed, open edge of the workspace.
 const rug=item('LoungeRug',2.8,2.1);box(4.45,.012,3.2,0,.008,0,mat('Lounge rug','#dad6c8',{roughness:1}),rug);
 sofa(3.15,.73,2.15,0,floor);sofa(5.15,2.55,.88,-Math.PI/2,blue,'LoungeChair');roundTable(3.2,2.12,.52,.4,m.wood,'CoffeeTable');cup(3.24,.428,2.1);
 const reception=item('ReceptionDesk',.12,3.95);rounded(1.75,.99,.68,0,.495,0,sage,reception);rounded(1.82,.045,.75,0,1.005,0,m.wood,reception);label('留白','SPACE FOR GOOD WORK',1.28,.36,0,.60,.35,reception,'#8c9c88','#f4efdc');
 const laptop=await loadAsset('laptop'),plant=await loadAsset('plant');place(laptop,'laptop',.25,1.03,3.92,.213,0,'ReceptionLaptop');place(laptop,'laptop',4.3,.79,-3.13,.213,0,'MeetingLaptop');
 for(const [x,z,h]of [[-6.2,-3.4,1.45],[.35,-3.9,1.6],[6.15,4.12,1.55],[-.65,.12,1.25]])place(plant,'plant',x,0,z,h,0,'Plant');
 art(-.10,1.9,-4.91,1.1,1.55,1);const sideArt=item('WallArt',-6.895,3.5,Math.PI/2,'Structure');art(0,1.9,0,1.0,1.35,0,sideArt);
 for(const z of [-1.8,1.7]){const g=item('LinearTaskLight',-3.5,z,0,'Lighting');for(const x of [-1.25,1.25])bar([x,2.55,0],[x,3.23,0],.006,m.black,g,'Suspension');box(3.2,.065,.13,0,2.55,0,m.black,g,'Housing');box(3.13,.013,.10,0,2.51,0,m.light,g,'Diffuser');}
 pendant(4.3,-3.13,2.6,.38);pendant(3.2,2.12,2.55,.30);
 return k.finish();
}
