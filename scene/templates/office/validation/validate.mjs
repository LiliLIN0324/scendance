import fs from 'node:fs';
import crypto from 'node:crypto';
import {createRequire} from 'node:module';
import * as THREE from '../vendor/three/three.module.js';
const require=createRequire(import.meta.url),base=new URL('../',import.meta.url);
// The validation runtime is supplied by this workspace; it is not needed to view the ZIP.
const validator=require(process.env.GLTF_VALIDATOR_PATH||'../../../scendance-frontend/node_modules/gltf-validator');
const bytes=fs.readFileSync(new URL('office.glb',base)),sha256=crypto.createHash('sha256').update(bytes).digest('hex');
const gltf=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString());
const formatReport=await validator.validateBytes(new Uint8Array(bytes),{uri:'office.glb',maxIssues:2000});
fs.writeFileSync(new URL('validation/gltf-validation.json',base),JSON.stringify(formatReport,null,2)+'\n');
const root=gltf.nodes.find(n=>n.name==='Office_CreativeWorkspace_14x10');
if(!root)throw new Error('Missing root');
const issues=[],groupNames=['Structure','Furniture','Equipment','Lighting','Roof'].map(n=>`Office_${n}`);
for(const name of groupNames)if(!gltf.nodes.some(n=>n.name===name))issues.push(`Missing group ${name}`);
const inventory=root.extras.inventory,named=gltf.nodes.filter(n=>n.extras?.editableObject),names=named.map(n=>n.name);
if(names.length!==new Set(names).size)issues.push('Duplicate editable object names');
for(const o of inventory)if(!named.some(n=>n.name===o.name))issues.push(`Missing independent object ${o.name}`);
if(named.length!==inventory.length)issues.push('Inventory count mismatch');
const external=[...(gltf.buffers||[]),...(gltf.images||[])].filter(x=>x.uri);
if(external.length)issues.push('External model resources');
const matrices=new Map();
function visit(i,parent=new THREE.Matrix4()){
 const n=gltf.nodes[i],local=n.matrix?new THREE.Matrix4().fromArray(n.matrix):new THREE.Matrix4().compose(new THREE.Vector3(...(n.translation||[0,0,0])),new THREE.Quaternion(...(n.rotation||[0,0,0,1])),new THREE.Vector3(...(n.scale||[1,1,1])));
 const world=parent.clone().multiply(local);matrices.set(i,world);for(const c of n.children||[])visit(c,world);
}
for(const i of gltf.scenes[gltf.scene||0].nodes)visit(i);
function bounds(i,result=new THREE.Box3()){
 const n=gltf.nodes[i];if(n.mesh!==undefined)for(const p of gltf.meshes[n.mesh].primitives){const a=gltf.accessors[p.attributes.POSITION];if(a.min&&a.max)result.union(new THREE.Box3(new THREE.Vector3(...a.min),new THREE.Vector3(...a.max)).applyMatrix4(matrices.get(i)));}
 for(const c of n.children||[])bounds(c,result);return result;
}
const items=[];let triangles=0,meshInstances=0;
gltf.nodes.forEach((n,i)=>{if(n.mesh!==undefined){meshInstances++;for(const p of gltf.meshes[n.mesh].primitives)triangles+=(p.indices===undefined?gltf.accessors[p.attributes.POSITION].count:gltf.accessors[p.indices].count)/3;}if(n.extras?.editableObject){const b=bounds(i);const item={name:n.name,role:n.extras.role,min:b.min.toArray(),max:b.max.toArray()};items.push(item);if(item.min.some(v=>!Number.isFinite(v))||item.max.some(v=>!Number.isFinite(v)))issues.push(`Invalid bounds ${n.name}`);if(!['MeetingPartition','MeetingFrontGlass','WallArt'].includes(n.extras.role)&&(b.min.x< -7.08||b.max.x>7.08||b.min.z< -5.08||b.max.z>5.08))issues.push(`Object beyond conceptual floor ${n.name}`);}});
const modelBounds=new THREE.Box3();for(const i of gltf.scenes[gltf.scene||0].nodes)bounds(i,modelBounds);
const summary={date:new Date().toISOString(),bytes:bytes.length,sha256,validatorVersion:formatReport.validatorVersion,errors:formatReport.issues.numErrors,warnings:formatReport.issues.numWarnings,infos:formatReport.issues.numInfos,embeddedImages:(gltf.images||[]).length,externalResources:external.length,nodes:gltf.nodes.length,meshInstances,triangles,materials:gltf.materials.length,editableObjects:named.length,groups:groupNames,counts:root.extras.counts,sceneBounds:{min:modelBounds.min.toArray(),max:modelBounds.max.toArray()},issues,items,scope:'Actual exported GLB format, embedded resources, independent object inventory, names, world bounds and concept floor boundary. This is not a full pairwise collision or building compliance check.'};
fs.writeFileSync(new URL('validation/model-validation.json',base),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({...summary,items:undefined}));if(summary.errors||summary.warnings||issues.length)process.exitCode=1;
