// Check the real exported chair bounds and the same attendance function used by the UI.
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import * as THREE from '../vendor/three/three.module.js';
const base=new URL('../',import.meta.url),bytes=fs.readFileSync(new URL('lawn.glb',base));
const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const rootNode=doc.nodes.find(n=>n.name==='Lawn_Gathering_28x20');
const world=new Map();
function traverse(i,parent=new THREE.Matrix4()){
 const n=doc.nodes[i],local=n.matrix?new THREE.Matrix4().fromArray(n.matrix):new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation||[0,0,0])),new THREE.Quaternion(...(n.rotation||[0,0,0,1])),new THREE.Vector3(...(n.scale||[1,1,1])));
 const m=parent.clone().multiply(local);world.set(i,m);for(const c of n.children||[])traverse(c,m);
}
for(const i of doc.scenes[doc.scene||0].nodes)traverse(i);
function bounds(i,result=new THREE.Box3()){
 const n=doc.nodes[i];if(n.mesh!==undefined)for(const p of doc.meshes[n.mesh].primitives){const a=doc.accessors[p.attributes.POSITION];if(a.min&&a.max)result.union(new THREE.Box3(new THREE.Vector3(...a.min),new THREE.Vector3(...a.max)).applyMatrix4(world.get(i)));}
 for(const c of n.children||[])bounds(c,result);return result;
}
const chairs=doc.nodes.flatMap((n,i)=>/^AudienceChair_\d+$/.test(n.name||'')?[{id:n.name,b:bounds(i)}]:[]);
const issues=[];let cases=0;
const source=fs.readFileSync(new URL('model.js',base),'utf8').replace(/^import .*;\n/gm,'').replace(/\bexport /g,'');
const context={THREE};vm.createContext(context);vm.runInContext(source+'\nthis.apply=applyAttendance;this.seats=SEATS;',context);
const root=new THREE.Group();for(const [name,count]of [['People',60],['Staff',4],['Seating',60]]){const g=new THREE.Group();g.name=`Lawn_${name}`;for(let i=0;i<count;i++)g.add(new THREE.Group());root.add(g);}
const obstacleRects=rootNode.extras.furnitureFootprints;
for(const count of Array.from({length:41},(_,i)=>20+i))for(const phase of ['setup','open','launch','closed']){
 cases++;const total=context.apply(root,count,phase,true),people=[...root.getObjectByName('Lawn_People').children,...root.getObjectByName('Lawn_Staff').children].filter(p=>p.visible);
 const activeChairs=chairs.slice(0,count);const chairCount=root.getObjectByName('Lawn_Seating').children.filter(p=>p.visible).length;
 if(chairCount!==count||people.length!==total||total!==(phase==='open'||phase==='launch'?count+4:4))issues.push({count,phase,error:'count mismatch'});
 for(const [i,p]of people.entries()){
  const {x,z}=p.position,r=.22;
  if(Math.abs(x)+r>14||Math.abs(z)+r>10)issues.push({count,phase,person:i,error:'outside floor'});
  // Audience seated in their assigned chairs; speaker standing on the stage is intentional.
  const speakerOnStage=phase==='launch'&&p===root.getObjectByName('Lawn_Staff').children[0];
  for(const o of obstacleRects){if(speakerOnStage&&o.id==='stage')continue;const dx=Math.max(Math.abs(x-o.x)-o.width/2,0),dz=Math.max(Math.abs(z-o.z)-o.depth/2,0);if(dx*dx+dz*dz<r*r)issues.push({count,phase,person:i,obstacle:o.id,error:'standing footprint overlaps obstacle'});}
  for(let j=0;j<i;j++)if(Math.hypot(x-people[j].position.x,z-people[j].position.z)<.44)issues.push({count,phase,people:[i,j],error:'person spacing'});
 }
 for(const [i,{id,b}]of activeChairs.entries()){
  if(b.min.x< -14||b.max.x>14||b.min.z< -10||b.max.z>10)issues.push({count,phase,id,error:'chair outside floor'});
  if(b.min.x<.9&&b.max.x>-.9)issues.push({count,phase,id,error:'chair intrudes central walkway'});
  for(let j=0;j<i;j++){const q=activeChairs[j].b;if(b.min.x<q.max.x&&b.max.x>q.min.x&&b.min.z<q.max.z&&b.max.z>q.min.z)issues.push({count,phase,id,other:activeChairs[j].id,error:'chair overlap'});}
 }
}
const report={date:new Date().toISOString(),modelSha256:crypto.createHash('sha256').update(bytes).digest('hex'),cases,range:[20,60],phases:['setup','open','launch','closed'],exportedChairs:chairs.length,issues,scope:'Uses the production attendance function, exported chair world bounds, 0.22m schematic person radius, floor bounds, fixed major furniture footprints, person spacing and 1.8m centre walkway. Intentional seated chair contact and stage speaker support are allowed.',notChecked:['Detailed body-to-chair fit','Canopy posts and foliage','Continuous walking and queue simulation','Ground slope, weather, structural or regulatory capacity'],firstChairSize:chairs[0].b.getSize(new THREE.Vector3()).toArray()};
fs.writeFileSync(new URL('validation/layout-check.json',base),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({cases,issues:issues.slice(0,12),issueCount:issues.length,firstChairSize:report.firstChairSize}));if(issues.length)process.exitCode=1;
