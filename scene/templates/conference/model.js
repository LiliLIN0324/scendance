import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export const SEATS=[];
for(let row=0;row<8;row++)for(let col=0;col<6;col++)for(const side of [-1,1])SEATS.push({x:side*(1.5+col*.8),z:-3.6+row*1.2,row,col,side});
export const ZONES=[
 {id:'stage',n:'01',title:'报告与圆桌讨论',point:[0,3.8,-6.8],copy:'11 × 3.6 米舞台；主屏、讲台与四把嘉宾椅。报告模式为 1 人主讲、3 人就座；圆桌模式为 4 人在固定嘉宾席就座。'},
 {id:'audience',n:'02',title:'双侧观众席',point:[0,1.1,.5],copy:'8 排、每排 12 个固定排位，中央通道 2 米。人数包含 4 位嘉宾；观众人数和座椅数量同步变化，优先使用前排。'},
 {id:'welcome',n:'03',title:'入口签到',point:[-9.65,2.0,7.85],copy:'入口左侧领取胸牌与议程。4 名工作人员另外计数；签到只是预设画面，不是连续人流仿真。'},
 {id:'poster',n:'04',title:'学术海报交流',point:[-10.7,2.1,-.7],copy:'三块原创示例海报，展示议题与交流版式。所有内容均为虚构，不包含真实论文或研究结论。'},
 {id:'refreshment',n:'05',title:'茶歇服务',point:[10.4,1.8,-.7],copy:'沿右侧墙面布置饮水、咖啡与轻食，访客停留点位位于观众侧通道以外。'},
 {id:'control',n:'06',title:'会务控制',point:[9.6,1.6,4.9],copy:'后侧配置双屏控制台、调音设备与电脑。当前人数方案只启用固定合格排位，不代表任意场地智能重排。'},
];
export const PHASES={
 setup:{clock:'08:00 — 09:00',text:'布场：仅显示 4 名工作人员；观众椅按当前人数方案准备。',guestVisible:false},
 open:{clock:'09:00 — 09:30',text:'签到：部分参会者在签到、海报和茶歇点位停留，其余已就座。预设画面，不是人流仿真。',guestVisible:true},
 launch:{clock:'09:30 — 11:30',text:'报告：观众全部落座；4 位嘉宾按报告或圆桌模式进入指定位置。',guestVisible:true},
 closed:{clock:'11:30 — 12:00',text:'散场：参会者已离场，仅保留 4 名工作人员整理场地。',guestVisible:false},
};
const GUEST_SEATS=[[-3,-6.95],[-1.7,-6.95],[-.4,-6.95],[.9,-6.95]];
const SOCIAL_SPOTS=[[-10.45,8.6],[-9.25,8.6],[9.12,-1.75],[9.12,-.25],[-9.7,-3.45],[-9.7,-.75],[-9.7,1.95],[8.6,2.85]];
const STAFF_SPOTS=[[-10.4,7.10,0,0],[11.3,-.7,0,-Math.PI/2],[9.6,5.85,0,Math.PI],[-9,-6.1,0,Math.PI/2]];
function random(seed=143){return()=>{seed=(1664525*seed+1013904223)>>>0;return seed/4294967296;};}
function texture(draw,w=1024,h=512){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.name='Conference_embedded_canvas';t.colorSpace=THREE.SRGBColorSpace;return t;}
function surface(color,kind){return texture((c,w,h)=>{const r=random(143);c.fillStyle=color;c.fillRect(0,0,w,h);for(let i=0;i<18000;i++){c.fillStyle=`rgba(${r()>.5?'235,240,242':'24,43,65'},${r()*(kind==='carpet'?.16:.06)})`;if(kind==='wood')c.fillRect(r()*w,0,.4+r(),h);else c.fillRect(r()*w,r()*h,1+r()*2,1+r()*2);}},512,512);}
function graphic(title,sub,bg='#142d47',fg='#f2eee5',type='sign'){
 return texture((c,w,h)=>{c.fillStyle=bg;c.fillRect(0,0,w,h);const accent='#71bec8';
  if(type==='screen'){
   c.strokeStyle='rgba(164,207,216,.10)';c.lineWidth=1;for(let x=0;x<w;x+=64){c.beginPath();c.moveTo(x,0);c.lineTo(x,h);c.stroke();}for(let y=0;y<h;y+=64){c.beginPath();c.moveTo(0,y);c.lineTo(w,y);c.stroke();}
   c.fillStyle=accent;c.fillRect(w*.065,h*.11,w*.028,5);c.font=`500 ${h*.035}px -apple-system,sans-serif`;c.fillText('COMMON GROUND  /  FICTIONAL CONFERENCE',w*.11,h*.13);
   c.fillStyle=fg;c.font=`600 ${h*.205}px "PingFang SC",sans-serif`;c.fillText('共知',w*.06,h*.47);c.font=`500 ${h*.080}px "PingFang SC",sans-serif`;c.fillText('学术交流会',w*.27,h*.46);
   c.font=`${h*.052}px "PingFang SC",sans-serif`;c.fillStyle='#b6ced6';c.fillText('让不同的问题，在这里相遇。',w*.065,h*.61);
   const blocks=[['01','主旨报告','KEYNOTE'],['02','圆桌讨论','PANEL'],['03','海报交流','POSTERS']];for(let i=0;i<3;i++){const x=w*.065+i*w*.225;c.fillStyle='rgba(255,255,255,.07)';c.fillRect(x,h*.72,w*.20,h*.18);c.fillStyle=accent;c.font=`${h*.047}px sans-serif`;c.fillText(blocks[i][0],x+22,h*.785);c.fillStyle=fg;c.font=`${h*.044}px "PingFang SC",sans-serif`;c.fillText(blocks[i][1],x+75,h*.785);c.fillStyle='#b6ced6';c.font=`${h*.029}px sans-serif`;c.fillText(blocks[i][2],x+75,h*.85);}
   c.strokeStyle=accent;c.lineWidth=3;for(let i=0;i<4;i++){c.beginPath();c.arc(w*.92,h*.39,h*(.21+i*.10),0,Math.PI*2);c.stroke();}c.fillStyle='#91a9b3';c.font=`${h*.026}px sans-serif`;c.fillText('ORIGINAL EXAMPLE • NO REAL EVENT OR RESEARCH CLAIMS',w*.065,h*.965);
  }else if(type==='poster'){
   c.fillStyle='#e9eef0';c.fillRect(0,0,w,h);c.fillStyle='#142d47';c.fillRect(0,0,w,h*.245);c.fillStyle=accent;c.font=`600 ${h*.023}px sans-serif`;c.fillText('COMMON GROUND / EXAMPLE POSTER',w*.075,h*.067);c.fillStyle='#fffaf0';c.font=`600 ${h*.063}px "PingFang SC",sans-serif`;c.fillText(title,w*.075,h*.145,w*.87);c.font=`${h*.025}px sans-serif`;c.fillText(sub,w*.075,h*.205,w*.86);
   c.fillStyle='#142d47';c.font=`500 ${h*.032}px "PingFang SC",sans-serif`;c.fillText('一个值得交流的问题',w*.075,h*.32);c.fillStyle='#667d8b';c.font=`${h*.024}px "PingFang SC",sans-serif`;c.fillText('虚构议题 · 仅作会场内容与版式示例',w*.075,h*.365,w*.85);
   for(let i=0;i<3;i++){const y=h*(.43+i*.105);c.fillStyle=['#d9e5e7','#cfdddf','#c0d5d9'][i];c.fillRect(w*.075,y,w*.85,h*.075);c.fillStyle='#31546a';c.font=`600 ${h*.028}px "PingFang SC",sans-serif`;c.fillText(['01  提问 / QUESTION','02  方法 / APPROACH','03  讨论 / DISCUSSION'][i],w*.12,y+h*.047);}
   c.strokeStyle='#9cb9c1';c.lineWidth=3;c.beginPath();c.moveTo(w*.18,h*.82);c.lineTo(w*.5,h*.75);c.lineTo(w*.82,h*.82);c.stroke();for(const[x,y]of[[.18,.82],[.5,.75],[.82,.82]]){c.fillStyle='#31546a';c.beginPath();c.arc(w*x,h*y,h*.023,0,Math.PI*2);c.fill();}c.fillStyle='#657d89';c.font=`${h*.021}px "PingFang SC",sans-serif`;c.fillText('不含真实数据、论文或研究结论',w*.075,h*.92,w*.85);c.font=`${h*.018}px sans-serif`;c.fillText('FICTIONAL EXAMPLE / NO RESEARCH CLAIMS',w*.075,h*.958,w*.85);
  }else{c.strokeStyle='rgba(113,190,200,.25)';c.lineWidth=3;for(let i=0;i<3;i++){c.beginPath();c.arc(w*.96,h*.84,h*(.4+i*.23),0,Math.PI*2);c.stroke();}c.fillStyle=fg;c.textAlign='center';c.textBaseline='middle';c.font=`600 ${h*.31}px "PingFang SC",sans-serif`;c.fillText(title,w/2,h*.42,w*.88);c.fillStyle=fg;c.font=`${h*.105}px -apple-system,sans-serif`;c.fillText(sub,w/2,h*.78,w*.88);}
 },type==='screen'?2048:1024,type==='screen'?640:type==='poster'?1536:512);
}
export async function buildConference(){
 const root=new THREE.Group();root.name='Conference_24x18';const groups={};for(const name of ['Structure','Furniture','Seating','GuestSeating','Roof','Lights','People','Guests','Staff']){const g=new THREE.Group();g.name=`Conference_${name}`;root.add(g);groups[name]=g;}
 const {Structure:S,Furniture:F,Seating:A,GuestSeating:G,Roof:R,Lights:Lights,People:P,Guests:Guests,Staff:Staff}=groups;let serial=0;const footprints=[];
 const mat=(name,color,extra={})=>Object.assign(new THREE.MeshStandardMaterial({color,roughness:.72,...extra}),{name});
 const navy=mat('Conference navy','#163149'),steel=mat('Powdercoated navy metal','#30465a',{metalness:.55,roughness:.4}),oak=mat('Pale acoustic oak','#cbbc9a',{map:surface('#d8c9aa','wood')}),cream=mat('Warm white plaster','#e6e3db'),carpet=mat('Blue grey woven carpet','#718392',{map:surface('#718392','carpet'),roughness:1});carpet.map.wrapS=carpet.map.wrapT=THREE.RepeatWrapping;carpet.map.repeat.set(12,9);
 const aisle=mat('Darker woven aisle','#60727f',{map:surface('#60727f','carpet'),roughness:1}),black=mat('Equipment charcoal','#202932',{metalness:.2,roughness:.55}),paper=mat('Warm paper','#fcf8ec'),accent=mat('Teal wayfinding','#64a9b2'),brass=mat('Brushed brass','#b29c70',{metalness:.65,roughness:.35}),glass=mat('Door glass','#8aa1ac',{transparent:true,opacity:.2,roughness:.12,metalness:.1}),lightMat=mat('Warm luminaire','#fff6d8',{emissive:'#ffe1aa',emissiveIntensity:2.2});
 const mesh=(geometry,m,x,y,z,parent=S,name='Part')=>{const o=new THREE.Mesh(geometry,m);o.position.set(x,y,z);o.name=`${name}_${String(++serial).padStart(4,'0')}`;o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;};
 const box=(w,h,d,x,y,z,m=oak,parent=S,name='Panel')=>mesh(new THREE.BoxGeometry(w,h,d),m,x,y,z,parent,name);
 const cyl=(r,h,x,y,z,m=steel,parent=F,name='Column',n=20)=>mesh(new THREE.CylinderGeometry(r,r,h,n),m,x,y,z,parent,name);
 const line=(a,b,r,m=steel,parent=F,name='Rail')=>{const va=new THREE.Vector3(...a),vb=new THREE.Vector3(...b),delta=vb.clone().sub(va);const o=mesh(new THREE.CylinderGeometry(r,r,delta.length(),8),m,...va.clone().add(vb).multiplyScalar(.5).toArray(),parent,name);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());return o;};
 const fp=(id,x,z,width,depth,kind='furniture')=>footprints.push({id,x,z,width,depth,kind,allowAisle:false});
 function sign(title,sub,w,h,x,y,z,parent=F,type='sign',rotation=0){const artwork=graphic(title,sub,'#142d47','#f2eee5',type);const m=type==='screen'?Object.assign(new THREE.MeshBasicMaterial({map:artwork,toneMapped:false}),{name:'Conference unlit main screen'}):mat(`Conference graphic ${title}`,'#ffffff',{map:artwork,roughness:.9});const o=mesh(new THREE.PlaneGeometry(w,h),m,x,y,z,parent,`Graphic_${type}`);o.rotation.y=rotation;return o;}
 // Architectural shell: the top, entrance wall, and right wall are one removable occlusion layer.
 box(24,.22,18,0,-.13,0,steel,S,'Floor_slab_24x18');box(23.98,.025,17.98,0,-.0075,0,carpet,S,'Carpet');
 box(2,.012,10.5,0,.012,.45,aisle,S,'Central_aisle_2m');for(const x of [-6.9,6.9])box(1.4,.012,10.5,x,.012,.45,aisle,S,'Side_aisle_1_4m');box(23.4,.012,.85,0,.013,6.2,aisle,S,'Rear_cross_aisle');
 box(24,.12,.09,0,.06,-8.9,oak,S,'Wall_skirting');box(.15,5.3,18,-11.925,2.65,0,cream,S,'Left_wall');box(24,5.3,.15,0,2.65,-8.925,cream,S,'Back_wall');
 box(.12,5.3,18,11.94,2.65,0,cream,R,'Right_wall');box(24,.17,18,0,5.4,0,cream,R,'Ceiling');
 for(const x of [-8,8])box(8,5.3,.15,x,2.65,8.925,cream,R,'Entrance_wall');box(8,2.2,.15,0,4.2,8.925,cream,R,'Entrance_header');for(const x of [-1.1,1.1]){box(2.12,2.85,.035,x,1.44,8.925,glass,R,'Entrance_glass_door');for(const dx of [-1.08,1.08])box(.045,2.9,.065,x+dx,1.45,8.92,steel,R,'Door_frame');line([x+Math.sign(x)*-.65,1,8.86],[x+Math.sign(x)*-.65,1.6,8.86],.025,brass,R,'Door_handle');}
 sign('共知 · 欢迎交流','COMMON GROUND / ENTRANCE',5.8,.7,0,3.5,8.83,R,'sign',Math.PI);
 // Pale oak acoustic panels and fin spacing form the indoor character.
 for(let x=-11.6;x<11.8;x+=.26)box(.08,3.55,.16,x,1.83,-8.78,oak,S,'Back_acoustic_fin');
 for(let z=-8.2;z<8.4;z+=.28){box(.12,2.7,.065,-11.77,1.4,z,oak,S,'Left_acoustic_fin');box(.12,2.7,.065,11.77,1.4,z,oak,R,'Right_acoustic_fin');}
 for(const z of [-6.5,-2,2.5,7]){box(.18,.16,2.3,-11.68,3.55,z,navy,S,'Wall_wash_housing');box(.04,.04,2.15,-11.56,3.48,z,lightMat,S,'Wall_wash_diffuser');}
 for(const z of [-5.5,-1,3.5,7]){box(19,.10,.16,0,5.16,z,steel,R,'Suspended_linear_fixture');box(18.8,.035,.09,0,5.085,z,lightMat,R,'Linear_light_diffuser');}
 // Raised stage, screen, side stair, and a continuous warm front edge.
 box(11,.45,3.6,0,.225,-6.8,oak,S,'Stage_11x3_6');fp('stage',0,-6.8,11,3.6,'stage');
 box(10.94,.035,.06,0,.39,-4.979,navy,S,'Stage_front_fascia');box(10.6,.02,.024,0,.41,-4.94,lightMat,S,'Stage_edge_light');
 for(let x=-5.3;x<5.4;x+=.28)box(.008,.006,3.48,x,.454,-6.8,cream,S,'Stage_board_joint');
 box(1.25,.15,1.30,-6.125,.075,-5.65,oak,S,'Stage_stair_lower');box(.83,.30,1.30,-5.915,.15,-5.65,oak,S,'Stage_stair_middle');fp('stage-stair',-6.125,-5.65,1.25,1.3,'stage-stair');
 line([-6.64,.75,-6.26],[-5.55,1.16,-6.26],.03,brass,S,'Stair_handrail');for(const [x,y]of[[-6.64,.42],[-5.55,.65]])line([x,.15,-6.26],[x,y*1.8,-6.26],.025,brass,S,'Stair_handrail_post');
 box(10,3.22,.17,0,2.49,-8.53,navy,S,'Screen_wall');box(9.44,2.57,.065,0,2.75,-8.411,black,F,'Main_screen_frame');sign('共知','COMMON GROUND',9.24,2.38,0,2.77,-8.372,F,'screen');
 sign('01 / 主会场','KEYNOTE · PANEL · POSTERS',2.35,.67,-9.25,3.7,-8.78,S);sign('共知','COMMON GROUND',1.6,.7,9.4,3.7,-8.78,S);
 // Authored lectern with a sloped reading surface, gooseneck microphone, notes, and conference badge.
 box(.67,.93,.52,3.65,.915,-6.45,navy,F,'Lectern_body');box(.78,.055,.64,3.65,1.395,-6.45,oak,F,'Lectern_sloped_top').rotation.x=.11;box(.52,.045,.045,3.65,1.436,-6.14,brass,F,'Lectern_paper_stop');box(.86,.055,.67,3.65,.48,-6.45,steel,F,'Lectern_base');sign('共知','COMMON GROUND',.56,.35,3.65,1.06,-6.181,F);box(.30,.009,.22,3.69,1.435,-6.43,paper,F,'Speaker_notes');line([3.4,1.43,-6.53],[3.4,1.65,-6.53],.012,black,F,'Gooseneck');line([3.4,1.65,-6.53],[3.61,1.73,-6.65],.017,black,F,'Lectern_microphone');fp('lectern',3.65,-6.45,.86,.67,'stage-furniture');
 // Fixed panel discussion chairs use the same four guest identities in both modes.
 box(5.1,.06,.6,-1.05,.86,-5.96,oak,F,'Guest_low_table');for(const x of [-3.1,1])for(const z of [-6.16,-5.76])box(.055,.36,.055,x,.65,z,steel,F,'Guest_table_leg');fp('guest-table',-1.05,-5.96,5.1,.6,'stage-furniture');
 for(let i=0;i<4;i++){const x=GUEST_SEATS[i][0];box(.45,.018,.23,x,.902,-5.95,paper,F,'Guest_namecard');sign(['嘉宾 A','嘉宾 B','嘉宾 C','嘉宾 D'][i],'FICTIONAL GUEST',.4,.12,x,.97,-5.645,F);cyl(.035,.16,x+.28,.98,-6.01,glass,F,'Guest_water_glass',12);}
 // Entry check-in includes physical badges, printed programs, cable grommet, and a laptop.
 function counter(x,z,w,d,name){box(w,.83,d,x,.415,z,navy,F,`${name}_body`);box(w+.1,.075,d+.08,x,.8675,z,oak,F,`${name}_top`);for(let k=0;k<Math.floor(w/.13);k++)box(.025,.64,.02,x-w/2+.1+k*.13,.42,z+d/2+.016,oak,F,`${name}_front_batten`);return{name,x,z,w:w+.1,d:d+.08};}
 counter(-9.65,7.85,3.6,.64,'Registration');fp('registration',-9.65,7.85,3.7,.72);sign('签到 / CHECK IN','胸牌 · 议程 · 交流',2.8,.4,-9.65,.5,8.196,F);
 sign('从一个问题开始','WELCOME TO COMMON GROUND',3.5,.58,-9.65,2.15,7.96,F);for(const x of[-11.28,-8.02])cyl(.027,2.02,x,1.01,7.91,steel,F,'Registration_signpost');
 for(let i=0;i<5;i++){box(.23,.021,.31,-10.4+i*.29,.928,7.92,paper,F,'Program_stack');box(.15,.016,.10,-10.5+i*.26,.94,7.63,accent,F,'Name_badge');}
 // Three poster boards face the audience side; every poster explicitly labels its content fictional.
 for(let i=0;i<3;i++){const z=-3.45+i*2.7;box(.08,1.76,1.24,-10.87,1.58,z,steel,F,'Poster_frame');sign(['城市与数据','知识的连接','面向下一问'][i],['A / CITIES & DATA','B / KNOWLEDGE LINKS','C / NEXT QUESTIONS'][i],1.16,1.67,-10.822,1.58,z,F,'poster',Math.PI/2);for(const dz of[-.43,.43]){box(.05,.72,.05,-10.87,.36,z+dz,steel,F,'Poster_upright');box(.65,.045,.13,-10.87,.025,z+dz,steel,F,'Poster_foot');}fp(`poster-${i+1}`,-10.87,z,.65,1.27);}
 // A compact side table provides a place for notes without entering the aisles.
 cyl(.58,.07,-10.1,.96,4.5,oak,F,'Poster_discussion_table');cyl(.055,.89,-10.1,.445,4.5,steel,F,'Poster_table_pedestal');cyl(.34,.045,-10.1,.025,4.5,steel,F,'Poster_table_base');fp('poster-table',-10.1,4.5,1.16,1.16);for(let i=0;i<3;i++)box(.21,.012,.29,-10.37+i*.24,1.003,4.47,paper,F,'Discussion_notes');
 // Right-hand tea bar: service counter runs along the wall, clear of the side aisle.
 const tea=new THREE.Group();tea.name='Refreshment_counter';tea.position.set(10.4,0,-.7);tea.rotation.y=-Math.PI/2;F.add(tea);
 box(3.4,.86,.72,0,.43,0,navy,tea,'Tea_counter');box(3.52,.07,.84,0,.895,0,oak,tea,'Tea_countertop');sign('茶歇 / REFRESHMENTS','WATER · COFFEE · CONVERSATION',2.9,.46,0,.5,.366,tea);fp('tea-counter',10.4,-.7,.84,3.52);
 box(.54,.50,.39,10.39,1.18,-1.55,black,F,'Coffee_machine');box(.43,.16,.03,9.998,1.30,-1.55,steel,F,'Coffee_controls');cyl(.085,.26,10.25,1.04,.38,steel,F,'Water_carafe');cyl(.085,.26,10.53,1.04,.38,steel,F,'Water_carafe');for(let i=0;i<6;i++)cyl(.034,.08,10.08+(i%2)*.19,.984,-.88+Math.floor(i/2)*.21,paper,F,'Cup',12);box(.34,.025,.56,10.42,.95,-.10,paper,F,'Snack_tray');for(let i=0;i<6;i++)mesh(new THREE.SphereGeometry(.054,8,6),oak,10.32+(i%2)*.15,1.00,-.29+Math.floor(i/2)*.18,F,'Pastry');
 sign('茶歇交流','TAKE A BREAK / SHARE A QUESTION',2.5,.56,11.74,2.9,-.7,F,'sign',-Math.PI/2);
 for(const z of[1.72,2.35]){box(.49,.69,.49,10.65,.345,z,navy,F,'Waste_sort_bin');box(.51,.05,.51,10.65,.715,z,oak,F,'Bin_lid');box(.20,.015,.12,10.65,.744,z,black,F,'Bin_opening');fp('waste-bin',10.65,z,.51,.51);}
 // AV control desk with twin screens and a small mixer. Operator is behind the desk.
 box(3.4,.075,.76,9.6,.82,4.9,oak,F,'Control_desktop');for(const x of[8.03,11.17])box(.07,.78,.64,x,.39,4.9,steel,F,'Control_desk_leg');fp('control-desk',9.6,4.9,3.4,.76);
 for(const x of[8.6,9.5]){box(.68,.41,.038,x,1.15,4.76,black,F,'Control_monitor');sign('共知 / AV','SESSION CONTROL',.64,.35,x,1.15,4.783,F);box(.05,.15,.05,x,.91,4.76,steel,F,'Monitor_stand');box(.30,.022,.21,x,.87,4.77,steel,F,'Monitor_base');box(.46,.025,.16,x,.88,5.05,black,F,'Control_keyboard');}
 box(.55,.10,.46,10.55,.915,4.91,black,F,'Audio_mixer');for(let i=0;i<6;i++){box(.017,.012,.24,10.34+i*.08,.972,4.88,steel,F,'Mixer_fader_track');box(.048,.018,.04,10.34+i*.08,.987,4.82+(i%3)*.05,paper,F,'Mixer_fader');cyl(.018,.019,10.34+i*.08,.986,5.07,accent,F,'Mixer_knob',8);}
 sign('会务控制','AV / SESSION CONTROL',2.8,.43,9.6,.52,4.51,F,'sign',Math.PI);
 // Archived assets are uniformly normalized without losing their internal node transforms.
 const loader=new GLTFLoader(),sources=await Promise.all(['chair','plant','speaker','laptop'].map(id=>loader.loadAsync(`./assets/models/${id}.glb`)));
 function asset(index,x,y,z,height,rotation,parent,name){const g=new THREE.Group();g.name=name;const o=sources[index].scene.clone(true);o.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(o),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());o.position.sub(new THREE.Vector3(center.x,bounds.min.y,center.z));g.add(o);g.scale.setScalar(height/size.y);g.position.set(x,y,z);g.rotation.y=rotation;g.userData.sourceAsset=['chair','plant','speaker','laptop'][index];o.traverse(node=>{node.name=`${name}_${node.name||'part'}`;if(node.isMesh){node.castShadow=true;node.receiveShadow=true;}});parent.add(g);return g;}
 SEATS.forEach((s,i)=>{const g=asset(0,s.x,.02,s.z,.86,Math.PI,A,`AudienceChair_${String(i+1).padStart(3,'0')}`);g.userData.seatIndex=i;g.userData.role='audience-seat';});
 GUEST_SEATS.forEach(([x,z],i)=>{const g=asset(0,x,.455,z,.88,0,G,`GuestChair_${String(i+1).padStart(2,'0')}`);g.userData.seatIndex=i;g.userData.role='guest-seat';});
 asset(3,-11,.915,7.83,.22,0,F,'Registration_laptop');
 for(const [x,z]of[[-6.65,-7.35],[6.65,-7.35]]){asset(2,x,.02,z,1.55,0,F,'Stage_PA');fp('stage-speaker',x,z,.68,.67);}
 for(const [x,z,h]of[[-10.6,-7.5,1.7],[10.6,-7.5,1.7],[-11.1,6.25,1.4],[11.0,7.7,1.5]]){asset(1,x,.02,z,h,0,F,'Conference_planter');fp('planter-pot',x,z,.58,.58);}
 // Warm luminaires remain real glTF punctual lights after export. The viewer may add ambient fill.
 for(const [i,x,z]of[[0,-4,-5.2],[1,4,-5.2],[2,-7,1],[3,7,1],[4,0,5.8]]){const l=new THREE.PointLight(i<2?'#fff1dc':'#edf3ff',i<2?38:28,19,2);l.name=`Conference_PointLight_${i+1}`;l.position.set(x,4.75,z);Lights.add(l);cyl(.20,.13,x,4.8,z,steel,S,'Pendant_housing');cyl(.16,.025,x,4.72,z,lightMat,S,'Pendant_diffuser');}
 const wash=new THREE.PointLight('#abd6df',9,12,2);wash.name='Conference_ScreenGlow';wash.position.set(0,3,-7.8);Lights.add(wash);
 // One reusable joint rig per person; seated/standing transforms survive an independent default GLB export.
 const skin=['#c39d80','#e1bfa0','#987155','#bb876c'].map((c,i)=>mat(`Skin_${i}`,c)),clothing=['#f0eadb','#637b8f','#849a9d','#a48c76','#566877','#b8c4c2'].map((c,i)=>mat(`Conference_cloth_${i}`,c)),pants=[mat('Navy trousers','#344759'),mat('Stone trousers','#8d9492')];
 const headGeo=new THREE.SphereGeometry(.105,10,8),bodyGeo=new THREE.CapsuleGeometry(.12,.31,3,8),legGeo=new THREE.CapsuleGeometry(.044,.31,3,7),armGeo=new THREE.CapsuleGeometry(.034,.29,3,7),handGeo=new THREE.SphereGeometry(.037,7,5),shoeGeo=new THREE.BoxGeometry(.10,.075,.19),hairGeo=new THREE.SphereGeometry(.106,10,8,0,Math.PI*2,0,Math.PI*.58),badgeGeo=new THREE.BoxGeometry(.062,.08,.009);
 const hairs=[mat('Dark hair','#26323b'),mat('Brown hair','#58483c'),mat('Grey hair','#b0aea4')];
 function person(i,role,parent){const g=new THREE.Group();g.name=`${role==='audience'?'Audience':role==='guest'?'Guest':'Staff'}_${String(i+1).padStart(role==='audience'?3:2,'0')}`;g.userData={role,seatIndex:i,assignedSeatIndex:role==='audience'?i:null,footprintRadius:.24};parent.add(g);const top=role==='staff'?navy:clothing[(i+(role==='guest'?1:0))%6];
  const p=new THREE.Group();p.name=`${g.name}_pose`;g.add(p);const item=(geo,m,joint)=>{const o=mesh(geo,m,0,0,0,p,`${g.name}_${joint}`);o.userData.joint=joint;return o;};item(bodyGeo,top,'Torso');item(headGeo,skin[i%4],'Head');item(hairGeo,hairs[i%3],'Hair');item(badgeGeo,paper,'Badge');for(const side of[-1,1]){item(legGeo,pants[i%2],`Thigh_${side}`);item(legGeo,pants[i%2],`Shin_${side}`);item(shoeGeo,black,`Shoe_${side}`);item(armGeo,top,`Arm_${side}`);item(handGeo,skin[i%4],`Hand_${side}`);}setPose(g,false);return g;}
 for(let i=0;i<96;i++)person(i,'audience',P);for(let i=0;i<4;i++)person(i,'guest',Guests);for(let i=0;i<4;i++)person(i,'staff',Staff);
 root.userData={templateId:'conference-100-v1',kind:'complete-scene-template',width:24,depth:18,area:432,units:'meters',dimensionsBasis:'Concept assumption; not surveyed or certified capacity',defaultAttendees:100,defaultVisitors:100,staff:4,guestCount:4,maxAudience:96,attendeeRange:[40,100],seatPositions:SEATS,guestSeatPositions:GUEST_SEATS,furnitureFootprints:footprints,aisles:[{id:'central',minX:-1,maxX:1,minZ:-4.6,maxZ:5.5,width:2},{id:'left',minX:-7.6,maxX:-6.2,minZ:-4.6,maxZ:5.5,width:1.4},{id:'right',minX:6.2,maxX:7.6,minZ:-4.6,maxZ:5.5,width:1.4}],centralAisleWidth:2,sideAisleWidth:1.4,assetRoles:['chair','plant','speaker','laptop'],countDefinition:'attendees = audience + 4 guests; 4 staff additional',layoutBehavior:'fixed qualified positions, front rows first; no arbitrary space repacking',phaseBehavior:'four preset snapshots, not continuous crowd simulation',modeBehavior:'fixed panel seats: lecture = 1 guest at lectern + 3 seated; panel = 4 seated; guest chairs remain 4'};
 applyAttendance(root,100,'launch',true,'lecture');return root;
}
function setPose(person,seated){const parts={};person.traverse(o=>{if(o.userData.joint)parts[o.userData.joint]=o;});const set=(joint,x,y,z,rx=0)=>{const o=parts[joint];if(o){o.position.set(x,y,z);o.rotation.set(rx,0,0);}};const ty=seated?.87:1.12,hy=seated?1.24:1.49;set('Torso',0,ty,0);set('Head',0,hy,.005);set('Hair',0,hy+.025,0);set('Badge',.046,ty+.04,.125);for(const side of[-1,1]){set(`Thigh_${side}`,side*.071,seated?.48:.64,seated?.15:0,seated?Math.PI/2:0);set(`Shin_${side}`,side*.071,seated?.24:.225,seated?.32:0);set(`Shoe_${side}`,side*.071,.057,seated?.365:.045);set(`Arm_${side}`,side*.163,seated?.765:1.04,seated?.10:.015,seated?-.45:0);set(`Hand_${side}`,side*.163,seated?.59:.844,seated?.19:.015);}person.userData.pose=seated?'seated':'standing';}
export function applyAttendance(root,count=100,phase='launch',peopleVisible=true,mode='lecture'){
 count=Math.max(40,Math.min(100,Math.round(Number(count)||100)));if(!PHASES[phase])phase='launch';if(mode!=='panel')mode='lecture';const audienceCount=count-4,active=PHASES[phase].guestVisible;
 const people=root.getObjectByName('Conference_People'),guests=root.getObjectByName('Conference_Guests'),staff=root.getObjectByName('Conference_Staff'),chairs=root.getObjectByName('Conference_Seating'),guestChairs=root.getObjectByName('Conference_GuestSeating');
 chairs?.children.forEach((o,i)=>{o.visible=i<audienceCount;});guestChairs?.children.forEach(o=>{o.visible=true;});
 people?.children.forEach((p,i)=>{const standing=phase==='open'&&i<SOCIAL_SPOTS.length;const spot=standing?SOCIAL_SPOTS[i]:[SEATS[i].x,SEATS[i].z];p.position.set(spot[0],.02,spot[1]);p.rotation.y=standing?(i<2?Math.PI:i<4?Math.PI/2:i<7?-Math.PI/2:Math.PI):Math.PI;setPose(p,!standing);p.userData.assignedSeatIndex=standing?null:i;p.visible=!!peopleVisible&&active&&i<audienceCount;});
 guests?.children.forEach((p,i)=>{const speaking=phase==='launch'&&mode==='lecture'&&i===0;const index=phase==='launch'&&mode==='lecture'?Math.max(0,i-1):i;const spot=speaking?[3.65,-7.13]:GUEST_SEATS[index];p.position.set(spot[0],.455,spot[1]);p.rotation.y=0;setPose(p,!speaking);p.userData.assignedGuestSeatIndex=speaking?null:index;p.visible=!!peopleVisible&&active;});
 staff?.children.forEach((p,i)=>{const[x,z,y,angle]=STAFF_SPOTS[i];p.position.set(x,y,z);p.rotation.y=angle;setPose(p,false);p.visible=!!peopleVisible;});
 Object.assign(root.userData,{currentAttendees:count,currentVisitors:count,currentAudience:audienceCount,currentPhase:phase,currentMode:mode,peopleVisible:!!peopleVisible});root.updateMatrixWorld(true);
 return (people?.children.filter(p=>p.visible).length||0)+(guests?.children.filter(p=>p.visible).length||0)+(staff?.children.filter(p=>p.visible).length||0);
}
export function sceneReport(root){let meshes=0,triangles=0,lights=0;const materials=new Set(),textures=new Set();root.updateMatrixWorld(true);root.traverse(o=>{if(o.isLight)lights++;if(!o.isMesh)return;meshes++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3;for(const m of Array.isArray(o.material)?o.material:[o.material]){materials.add(m);for(const v of Object.values(m))if(v?.isTexture)textures.add(v);}});const reportSeats=name=>root.getObjectByName(name)?.children.map(o=>{const b=new THREE.Box3().setFromObject(o);return{name:o.name,seatIndex:o.userData.seatIndex,visible:o.visible,min:b.min.toArray(),max:b.max.toArray(),position:o.position.toArray()};});return{meshes,triangles,lights,materials:materials.size,textures:textures.size,bounds:new THREE.Box3().setFromObject(root).getSize(new THREE.Vector3()).toArray(),audienceChairs:reportSeats('Conference_Seating'),guestChairs:reportSeats('Conference_GuestSeating'),furnitureFootprints:root.userData.furnitureFootprints,audienceNodes:root.getObjectByName('Conference_People')?.children.length,guestNodes:root.getObjectByName('Conference_Guests')?.children.length,staffNodes:root.getObjectByName('Conference_Staff')?.children.length,aisles:root.userData.aisles,counts:{attendees:root.userData.currentAttendees,audience:root.userData.currentAudience,guests:4,staff:4}};}
export function portableCopy(root){const copy=root.clone(true),cache=new Map();copy.traverse(o=>{if(!o.geometry)return;const source=o.geometry;if(cache.has(source)){o.geometry=cache.get(source);return;}const geometry=source.clone();for(const[name,a]of Object.entries(source.attributes)){if(a.array instanceof Float32Array)continue;const array=new Float32Array(a.count*a.itemSize);for(let i=0;i<a.count;i++)for(let c=0;c<a.itemSize;c++)array[i*a.itemSize+c]=a[['getX','getY','getZ','getW'][c]](i);geometry.setAttribute(name,new THREE.Float32BufferAttribute(array,a.itemSize));}cache.set(source,geometry);o.geometry=geometry;});return copy;}
