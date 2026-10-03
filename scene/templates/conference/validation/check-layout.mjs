#!/usr/bin/env node
// Run from any directory: node validation/check-layout.mjs [conference.glb]
// This checks the production attendance function against the exported hierarchy
// and actual binary POSITION data. It does not rebuild an idealized chair grid.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three/three.module.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const base=path.resolve(here,'..');
const file=path.resolve(process.argv[2]||path.join(base,'conference.glb'));
const bytes=fs.readFileSync(file), EPS=1e-5, PERSON_RADIUS=.24;
const round=n=>Math.round(n*1e6)/1e6;
if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB 2 header');
let doc,bin;
for(let offset=12;offset<bytes.length;){const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);if(offset+8+length>bytes.length)throw new Error('Truncated GLB');const chunk=bytes.subarray(offset+8,offset+8+length);if(type===0x4e4f534a)doc=JSON.parse(chunk.toString());if(type===0x004e4942)bin=chunk;offset+=8+length;}
if(!doc||!bin)throw new Error('Expected JSON and binary chunks');
const issues=[],checkFailures=[],unsupported=[];
const fail=(kind,details={})=>issues.push({kind,...details});
const requireCheck=(name,passed,details={})=>{if(!passed){checkFailures.push(name);fail(name,details);}return passed;};
const localBounds=new Map(),accessorBounds=new Map();
const component={5120:[1,'getInt8',v=>Math.max(v/127,-1)],5121:[1,'getUint8',v=>v/255],5122:[2,'getInt16',v=>Math.max(v/32767,-1)],5123:[2,'getUint16',v=>v/65535],5125:[4,'getUint32',v=>v/4294967295],5126:[4,'getFloat32',v=>v]};
const binary=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
function readAccessor(index){
 const a=doc.accessors[index];if(a.type!=='VEC3')throw new Error(`POSITION accessor ${index} is not VEC3`);
 const spec=component[a.componentType];if(!spec)throw new Error(`Unsupported component type ${a.componentType}`);
 const values=new Float64Array(a.count*3),normalize=a.normalized?spec[2]:v=>v;
 if(a.bufferView!==undefined){const view=doc.bufferViews[a.bufferView];if(view.buffer!==0)throw new Error('External buffer is unsupported');const stride=view.byteStride||3*spec[0],start=(view.byteOffset||0)+(a.byteOffset||0);for(let i=0;i<a.count;i++)for(let c=0;c<3;c++)values[i*3+c]=normalize(binary[spec[1]](start+i*stride+c*spec[0],true));}
 if(a.sparse){const s=a.sparse,iv=doc.bufferViews[s.indices.bufferView],vv=doc.bufferViews[s.values.bufferView],is=component[s.indices.componentType],io=(iv.byteOffset||0)+(s.indices.byteOffset||0),vo=(vv.byteOffset||0)+(s.values.byteOffset||0);for(let i=0;i<s.count;i++){const target=binary[is[1]](io+i*is[0],true);for(let c=0;c<3;c++)values[target*3+c]=normalize(binary[spec[1]](vo+(i*3+c)*spec[0],true));}}
 return values;
}
function positionBounds(index){if(accessorBounds.has(index))return accessorBounds.get(index);const values=readAccessor(index),b=new THREE.Box3();for(let i=0;i<values.length;i+=3)b.expandByPoint(new THREE.Vector3(values[i],values[i+1],values[i+2]));accessorBounds.set(index,b);return b;}
const objects=doc.nodes.map((n,index)=>{
 const o=new THREE.Group();o.name=n.name||`Node_${index}`;o.userData=structuredClone(n.extras||{});o.userData.validationNodeIndex=index;
 if(n.matrix)new THREE.Matrix4().fromArray(n.matrix).decompose(o.position,o.quaternion,o.scale);else{o.position.fromArray(n.translation||[0,0,0]);o.quaternion.fromArray(n.rotation||[0,0,0,1]);o.scale.fromArray(n.scale||[1,1,1]);}
 if(n.skin!==undefined||n.weights||n.extensions?.EXT_mesh_gpu_instancing)unsupported.push({node:index,name:o.name,reason:'skin, morph or GPU instancing'});
 if(n.mesh!==undefined){const b=new THREE.Box3();for(const p of doc.meshes[n.mesh].primitives){if(p.targets)unsupported.push({node:index,name:o.name,reason:'morph targets'});if(p.attributes.POSITION!==undefined)b.union(positionBounds(p.attributes.POSITION));}localBounds.set(o,b);}
 return o;
});
doc.nodes.forEach((n,i)=>(n.children||[]).forEach(c=>objects[i].add(objects[c])));
const scene=new THREE.Group();for(const i of doc.scenes[doc.scene||0].nodes)scene.add(objects[i]);scene.updateMatrixWorld(true);
const root=scene.getObjectByName('Conference_24x18');if(!root)throw new Error('Missing Conference_24x18 root');
const groups={};for(const [key,name,count]of [['seats','Conference_Seating',96],['guestSeats','GuestSeating',4],['audience','People',96],['guests','Guests',4],['staff','Staff',4],['roof','Roof'],['structure','Structure'],['furniture','Furniture'],['lights','Lights']]){groups[key]=root.getObjectByName(name)||root.getObjectByName(`Conference_${name}`);requireCheck(`required-group-${name}`,Boolean(groups[key]),{expectedCount:count});if(groups[key]&&count!==undefined)requireCheck(`group-count-${name}`,groups[key].children.length===count,{actual:groups[key].children.length,expected:count});}
if(Object.values(groups).some(g=>!g))throw new Error(`Cannot continue: ${checkFailures.join(', ')}`);
requireCheck('supported-static-geometry',unsupported.length===0,{unsupported});
requireCheck('concept-size-24x18',root.userData.width===24&&root.userData.depth===18,{width:root.userData.width,depth:root.userData.depth});
const chairs=[...groups.seats.children,...groups.guestSeats.children];
const peopleGroups=[groups.audience,groups.guests,groups.staff];
const people=peopleGroups.flatMap(g=>g.children);
function worldBounds(object,visibleOnly=false,result=new THREE.Box3()){
 if(visibleOnly&&!object.visible)return result;
 const b=localBounds.get(object);if(b&&!b.isEmpty())result.union(b.clone().applyMatrix4(object.matrixWorld));
 for(const child of object.children)worldBounds(child,visibleOnly,result);return result;
}
function serializeBounds(b){return b.isEmpty()?null:{min:b.min.toArray().map(round),max:b.max.toArray().map(round),size:b.getSize(new THREE.Vector3()).toArray().map(round)};}
const baselineChairs=chairs.map(c=>({name:c.name,bounds:serializeBounds(worldBounds(c))}));
const source=fs.readFileSync(path.join(base,'model.js'),'utf8');
// Build functions remain uncalled. Imported browser-only constructors are not
// needed for applyAttendance; removing imports keeps this check network-free.
const executable=source.replace(/^import[\s\S]*?;\s*$/gm,'').replace(/\bexport\s+(?=(async\s+)?(function|const|let|class)\b)/g,'');
const context={THREE,console};vm.createContext(context);vm.runInContext(executable+'\nthis.productionApply=applyAttendance;this.productionSeats=SEATS;',context,{filename:'conference/model.js'});
if(typeof context.productionApply!=='function')throw new Error('Production applyAttendance not found');
const fixedFixtures=root.userData.furnitureFootprints||[];
requireCheck('furniture-footprints-present',fixedFixtures.length>0);
const aisles=[{id:'central',minX:-1,maxX:1,minZ:-4.6,maxZ:5.5},{id:'left-side',minX:-7.6,maxX:-6.2,minZ:-4.6,maxZ:5.5},{id:'right-side',minX:6.2,maxX:7.6,minZ:-4.6,maxZ:5.5}];
const rect=f=>({minX:f.x-f.width/2,maxX:f.x+f.width/2,minZ:f.z-f.depth/2,maxZ:f.z+f.depth/2});
const boxRect=b=>({minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z});
const overlaps=(a,b)=>a.minX<b.maxX-EPS&&a.maxX>b.minX+EPS&&a.minZ<b.maxZ-EPS&&a.maxZ>b.minZ+EPS;
const circleHits=(p,r,b)=>{const dx=Math.max(b.minX-p.x,0,p.x-b.maxX),dz=Math.max(b.minZ-p.z,0,p.z-b.maxZ);return dx*dx+dz*dz<r*r-EPS;};
const outside=b=>b.minX< -12-EPS||b.maxX>12+EPS||b.minZ< -9-EPS||b.maxZ>9+EPS;
const fixtures=fixedFixtures.map(f=>({...f,bounds:rect(f)}));
for(const f of fixtures){if(outside(f.bounds))fail('fixture-outside-floor',{id:f.id,bounds:f.bounds});if(!f.allowAisle)for(const a of aisles)if(overlaps(f.bounds,a))fail('fixture-in-main-aisle',{id:f.id,aisle:a.id});}
const phases=['setup','open','launch','closed'],modes=['lecture','panel'];
let cases=0,hiddenCases=0,minPersonDistance=Infinity,minSeatGap=Infinity;
const samples=[];const signatures={};
for(let count=40;count<=100;count++)for(const phase of phases)for(const mode of modes){
 cases++;const key={count,phase,mode};
 const returned=context.productionApply(root,count,phase,true,mode);scene.updateMatrixWorld(true);
 const activeAudience=groups.audience.children.filter(p=>p.visible),activeGuests=groups.guests.children.filter(p=>p.visible),activeStaff=groups.staff.children.filter(p=>p.visible),activePeople=people.filter(p=>p.visible);
 const activeAudienceSeats=groups.seats.children.filter(p=>p.visible),activeGuestSeats=groups.guestSeats.children.filter(p=>p.visible),activeChairs=[...activeAudienceSeats,...activeGuestSeats];
 const expectedVisitors=phase==='open'||phase==='launch',expectedAudience=expectedVisitors?count-4:0,expectedGuests=expectedVisitors?4:0,expectedTotal=expectedVisitors?count+4:4;
 if(activeAudience.length!==expectedAudience||activeGuests.length!==expectedGuests||activeStaff.length!==4||activePeople.length!==expectedTotal||returned!==expectedTotal)fail('people-count',{...key,audience:activeAudience.length,guests:activeGuests.length,staff:activeStaff.length,total:activePeople.length,returned,expectedTotal});
 if(activeAudienceSeats.length!==count-4||activeGuestSeats.length!==4||activeChairs.length!==count)fail('chair-count',{...key,audienceSeats:activeAudienceSeats.length,guestSeats:activeGuestSeats.length,expected:count});
 groups.seats.children.forEach((c,i)=>{if(c.visible!==(i<count-4))fail('front-row-priority',{...key,chair:c.name,index:i,visible:c.visible});});
 const chairBounds=activeChairs.map(c=>({object:c,bounds:worldBounds(c),name:c.name}));
 for(let i=0;i<chairBounds.length;i++){const c=chairBounds[i],b=boxRect(c.bounds);if(c.bounds.isEmpty())fail('chair-empty-geometry',{...key,chair:c.name});if(outside(b))fail('chair-outside-floor',{...key,chair:c.name,bounds:serializeBounds(c.bounds)});for(const a of aisles)if(overlaps(b,a))fail('chair-in-main-aisle',{...key,chair:c.name,aisle:a.id});for(let j=0;j<i;j++){const q=boxRect(chairBounds[j].bounds);if(overlaps(b,q))fail('chair-overlap',{...key,chair:c.name,other:chairBounds[j].name});const dx=Math.max(b.minX-q.maxX,q.minX-b.maxX,0),dz=Math.max(b.minZ-q.maxZ,q.minZ-b.maxZ,0);minSeatGap=Math.min(minSeatGap,Math.hypot(dx,dz));}}
 const positions=activePeople.map(p=>({object:p,position:p.getWorldPosition(new THREE.Vector3()),seated:p.userData.pose==='seated',role:p.userData.role}));
 for(let i=0;i<positions.length;i++){
  const item=positions[i],p=item.position,r=PERSON_RADIUS,name=item.object.name,stageGuest=groups.guests.children.includes(item.object);
  if(Math.abs(p.x)+r>12+EPS||Math.abs(p.z)+r>9+EPS)fail('person-outside-floor',{...key,person:name,position:p.toArray()});
  for(const a of aisles)if(circleHits(p,r,a))fail('person-in-main-aisle',{...key,person:name,aisle:a.id});
  for(const f of fixtures){if(stageGuest&&f.kind==='stage'||stageGuest&&/^stage(?:$|-)/i.test(f.id)&&!/step/i.test(f.id))continue;if(circleHits(p,r,f.bounds))fail('person-fixture-overlap',{...key,person:name,fixture:f.id,pose:item.object.userData.pose});}
  const audienceIndex=item.object.userData.assignedSeatIndex,guestIndex=item.object.userData.assignedGuestSeatIndex;
  const assignedChair=groups.audience.children.includes(item.object)&&Number.isInteger(audienceIndex)?groups.seats.children[audienceIndex]:groups.guests.children.includes(item.object)&&Number.isInteger(guestIndex)?groups.guestSeats.children[guestIndex]:undefined;
  if(item.seated){const chairPosition=assignedChair?.getWorldPosition(new THREE.Vector3());if(!assignedChair?.visible||!chairPosition||Math.hypot(p.x-chairPosition.x,p.z-chairPosition.z)>.45)fail('seated-person-without-matching-chair',{...key,person:name,chair:assignedChair?.name});}
  for(const chair of chairBounds){if(item.seated&&chair.object===assignedChair)continue;if(circleHits(p,r,boxRect(chair.bounds)))fail(item.seated?'seated-person-other-chair-overlap':'standing-person-chair-overlap',{...key,person:name,chair:chair.name});}
  for(let j=0;j<i;j++){const distance=Math.hypot(p.x-positions[j].position.x,p.z-positions[j].position.z);minPersonDistance=Math.min(minPersonDistance,distance);if(distance<r*2-EPS)fail('person-spacing',{...key,people:[name,positions[j].object.name],distance:round(distance)});}
 }
 if(count===40||count===70||count===100)samples.push({...key,audience:activeAudience.length,guests:activeGuests.length,staff:activeStaff.length,total:activePeople.length,audienceChairs:activeAudienceSeats.length,guestChairs:activeGuestSeats.length});
 if(count===100&&phase==='launch')signatures[mode]=groups.guests.children.map(p=>({name:p.name,pose:p.userData.pose,position:p.position.toArray()}));
 const hiddenReturned=context.productionApply(root,count,phase,false,mode);scene.updateMatrixWorld(true);hiddenCases++;
 if(hiddenReturned!==0||people.some(p=>p.visible))fail('people-toggle',{...key,returned:hiddenReturned});
 if(groups.seats.children.filter(c=>c.visible).length!==count-4||groups.guestSeats.children.filter(c=>c.visible).length!==4)fail('people-toggle-changed-chairs',key);
}
requireCheck('lecture-panel-different',JSON.stringify(signatures.lecture)!==JSON.stringify(signatures.panel),{signatures});
const report={checkedAt:new Date().toISOString(),file:path.basename(file),modelSha256:crypto.createHash('sha256').update(bytes).digest('hex'),modelSourceSha256:crypto.createHash('sha256').update(source).digest('hex'),passed:issues.length===0,scenarioCases:cases,peopleHiddenCases:hiddenCases,productionFunctionCalls:cases+hiddenCases,attendeeRange:[40,100],phases,modes,counts:{exportedAudienceChairs:groups.seats.children.length,exportedGuestChairs:groups.guestSeats.children.length,exportedAudiencePeople:groups.audience.children.length,exportedGuests:groups.guests.children.length,exportedStaff:groups.staff.children.length},countDefinition:'Selected attendees include 4 guests and count - 4 audience members. Four staff are additional. All phases retain count - 4 audience chairs plus 4 guest chairs. Setup/closed show 4 staff; open/launch show count + 4 people. Hiding people leaves chair counts unchanged.',floor:{width:24,depth:18,area:432,minX:-12,maxX:12,minZ:-9,maxZ:9,assumption:true},aisles,personProxyRadius:PERSON_RADIUS,minimumPersonCenterDistance:round(minPersonDistance),minimumChairPlanGap:round(minSeatGap),declaredFurnitureFootprints:fixedFixtures.length,readPositionAccessors:accessorBounds.size,chairWorldBounds:baselineChairs,modeSamples:signatures,samples,issueCount:issues.length,issues,scope:'Reconstructed exported GLB node hierarchy and actual binary POSITION bounds, transformed into world coordinates; production applyAttendance called for every selected count, phase, mode and people visibility. Static chair AABBs, floor limits, declared main aisles, standing-person proxy circles, fixed fixture footprints, and pair spacing checked. Stage support for guests and intentional seated chair contact are allowed.',limitations:['Fixed validated chair positions with front-row-first visibility; no arbitrary room re-layout or continuous crowd simulation.','Person clearance uses a 0.24 m schematic XZ radius, not animated-body or accessibility envelopes. Seated body-to-chair fit is reviewed visually.','Fixture checks use authored ground footprints; small props, overhead equipment and every furniture pair are not fully collision-tested.','Binary geometry AABBs can conservatively include empty corners after rotations.','Concept dimensions and counts are design assumptions; this is not a measured venue, capacity approval, fire, structural or evacuation certification.']};
fs.writeFileSync(path.join(here,'layout-check.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,scenarioCases:cases,peopleHiddenCases:hiddenCases,modelSha256:report.modelSha256,counts:report.counts,minimumPersonCenterDistance:report.minimumPersonCenterDistance,minimumChairPlanGap:report.minimumChairPlanGap,issueCount:issues.length,firstIssues:issues.slice(0,12)},null,2));
if(issues.length)process.exitCode=1;
