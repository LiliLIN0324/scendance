#!/usr/bin/env node
// Static café geometry check. No scene builder or browser code is executed.
// node validation/check-layout.mjs [cafe.glb]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as THREE from '../vendor/three/three.module.js';

const here=path.dirname(fileURLToPath(import.meta.url));
const EPS=1e-5;
export const round=n=>Number.isFinite(n)?Math.round(n*1e6)/1e6:null;
export const serializeBounds=b=>!b||b.isEmpty()?null:{min:b.min.toArray().map(round),max:b.max.toArray().map(round),size:b.getSize(new THREE.Vector3()).toArray().map(round)};

export function inspectGLB(file){
 const bytes=fs.readFileSync(file),chunks=[];
 if(bytes.length<20||bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB 2 header');
 let doc,bin;
 for(let offset=12;offset<bytes.length;){if(offset+8>bytes.length)throw new Error('Truncated chunk header');const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);if(offset+8+length>bytes.length)throw new Error('Truncated chunk payload');const data=bytes.subarray(offset+8,offset+8+length);chunks.push({type:type===0x4e4f534a?'JSON':type===0x004e4942?'BIN':type,bytes:length});if(type===0x4e4f534a)doc=JSON.parse(data.toString());if(type===0x004e4942)bin=data;offset+=8+length;}
 if(!doc||!bin)throw new Error('Expected JSON and BIN chunks');
 const issues=[],unsupported=[],positionCache=new Map(),binary=new DataView(bin.buffer,bin.byteOffset,bin.byteLength);
 const components={5120:[1,'getInt8',v=>Math.max(v/127,-1)],5121:[1,'getUint8',v=>v/255],5122:[2,'getInt16',v=>Math.max(v/32767,-1)],5123:[2,'getUint16',v=>v/65535],5125:[4,'getUint32',v=>v/4294967295],5126:[4,'getFloat32',v=>v]};
 function positions(index){
  if(positionCache.has(index))return positionCache.get(index);
  const a=doc.accessors[index],spec=components[a.componentType];if(a.type!=='VEC3'||!spec)throw new Error(`Unsupported POSITION accessor ${index}`);
  const values=new Float64Array(a.count*3),normalize=a.normalized?spec[2]:v=>v;
  if(a.bufferView!==undefined){const v=doc.bufferViews[a.bufferView];if(v.buffer!==0)throw new Error('External position buffers are not supported');const start=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||3*spec[0];for(let i=0;i<a.count;i++)for(let c=0;c<3;c++)values[i*3+c]=normalize(binary[spec[1]](start+i*stride+c*spec[0],true));}
  if(a.sparse){const s=a.sparse,iv=doc.bufferViews[s.indices.bufferView],vv=doc.bufferViews[s.values.bufferView],is=components[s.indices.componentType],io=(iv.byteOffset||0)+(s.indices.byteOffset||0),vo=(vv.byteOffset||0)+(s.values.byteOffset||0);for(let i=0;i<s.count;i++){const target=binary[is[1]](io+i*is[0],true);if(target>=a.count)throw new Error('Sparse position index outside accessor');for(let c=0;c<3;c++)values[target*3+c]=normalize(binary[spec[1]](vo+(i*3+c)*spec[0],true));}}
  if(!values.every(Number.isFinite))issues.push({kind:'non-finite-position-accessor',accessor:index});
  positionCache.set(index,values);return values;
 }
 const records=[],byIndex=new Map(),bounds=new THREE.Box3();let meshInstances=0,primitiveInstances=0,triangleInstances=0,vertexInstances=0;
 function walk(index,parentMatrix,parent=null,ancestors=[]){
  if(ancestors.includes(index))throw new Error('Cycle in GLB node hierarchy');
  if(byIndex.has(index))throw new Error('Node has multiple parents in default scene');
  const node=doc.nodes[index];if(!node)throw new Error(`Missing node ${index}`);
  const local=node.matrix?new THREE.Matrix4().fromArray(node.matrix):new THREE.Matrix4().compose(new THREE.Vector3(...(node.translation||[0,0,0])),new THREE.Quaternion(...(node.rotation||[0,0,0,1])),new THREE.Vector3(...(node.scale||[1,1,1])));
  const world=parentMatrix.clone().multiply(local),b=new THREE.Box3(),ownBounds=new THREE.Box3();
  if(!world.elements.every(Number.isFinite))issues.push({kind:'non-finite-world-transform',node:index,name:node.name});
  if(node.skin!==undefined||node.weights||node.extensions?.EXT_mesh_gpu_instancing)unsupported.push({node:index,name:node.name,reason:'skin, morph or GPU instancing'});
  const record={index,name:node.name||'',node,parent,world,position:new THREE.Vector3().setFromMatrixPosition(world),bounds:b,ownBounds,descendantMeshes:[]};records.push(record);byIndex.set(index,record);
  if(node.mesh!==undefined){meshInstances++;for(const primitive of doc.meshes[node.mesh].primitives){primitiveInstances++;if(primitive.targets)unsupported.push({node:index,name:node.name,reason:'morph targets'});const index=primitive.attributes.POSITION;if(index===undefined){issues.push({kind:'missing-position',node:record.index});continue;}const values=positions(index),p=new THREE.Vector3();for(let i=0;i<values.length;i+=3){p.set(values[i],values[i+1],values[i+2]).applyMatrix4(world);ownBounds.expandByPoint(p);}const count=doc.accessors[primitive.indices??index].count,mode=primitive.mode??4;triangleInstances+=mode===4?count/3:mode===5||mode===6?Math.max(0,count-2):0;vertexInstances+=values.length/3;}b.union(ownBounds);record.descendantMeshes.push(record);}
  for(const child of node.children||[]){const r=walk(child,world,index,[...ancestors,index]);b.union(r.bounds);record.descendantMeshes.push(...r.descendantMeshes);}
  if(!b.isEmpty()&&![...b.min.toArray(),...b.max.toArray()].every(Number.isFinite))issues.push({kind:'non-finite-world-bounds',node:index,name:node.name});
  return record;
 }
 for(const index of doc.scenes[doc.scene||0].nodes)bounds.union(walk(index,new THREE.Matrix4()).bounds);
 const root=records.find(r=>r.name==='Cafe_12x9');
 return{file,bytes,doc,chunks,root,records,byIndex,bounds,issues,unsupported,meshInstances,primitiveInstances,triangleInstances,vertexInstances,readPositionAccessors:positionCache.size,sha256:crypto.createHash('sha256').update(bytes).digest('hex')};
}

const asRect=f=>f.minX!==undefined?{minX:f.minX,maxX:f.maxX,minZ:f.minZ,maxZ:f.maxZ}:{minX:f.x-f.width/2,maxX:f.x+f.width/2,minZ:f.z-f.depth/2,maxZ:f.z+f.depth/2};
const boxRect=b=>({minX:b.min.x,maxX:b.max.x,minZ:b.min.z,maxZ:b.max.z});
const overlaps=(a,b)=>a.minX<b.maxX-EPS&&a.maxX>b.minX+EPS&&a.minZ<b.maxZ-EPS&&a.maxZ>b.minZ+EPS;
const overlap3D=(a,b)=>{const depths=['x','y','z'].map(k=>Math.min(a.max[k],b.max[k])-Math.max(a.min[k],b.min[k]));return depths.every(d=>d>EPS)?depths.map(round):null;};

export function validateLayout(inspection){
 const {root,records,issues:geometryIssues}=inspection;if(!root)throw new Error('Missing Cafe_12x9 root');
 const metadata=root.node.extras||{},issues=[...geometryIssues],editable=records.filter(r=>r.node.extras?.editableObject),footprints=metadata.furnitureFootprints||[],declaredAisles=metadata.aisles||metadata.clearAisles||[];
 const floor={minX:-6,maxX:6,minZ:-4.5,maxZ:4.5,width:12,depth:9,height:3.25,area:108,assumption:'Authored concept dimensions; not a measured building'};
 const inside=b=>b.minX>=floor.minX-EPS&&b.maxX<=floor.maxX+EPS&&b.minZ>=floor.minZ-EPS&&b.maxZ<=floor.maxZ+EPS;
 const finiteRect=(r,allowFlat=false)=>[r.minX,r.maxX,r.minZ,r.maxZ].every(Number.isFinite)&&(allowFlat?r.minX<=r.maxX&&r.minZ<=r.maxZ&&(r.minX<r.maxX||r.minZ<r.maxZ):r.minX<r.maxX&&r.minZ<r.maxZ);
 const aisles=declaredAisles.map((a,i)=>({id:a.id||a.name||`aisle-${i+1}`,...asRect(a)}));
 if(!footprints.length)issues.push({kind:'missing-furniture-footprints'});
 if(!aisles.length)issues.push({kind:'missing-authored-aisles'});
 for(const a of aisles)if(!finiteRect(a)||!inside(a))issues.push({kind:'invalid-aisle',aisle:a});
 const matched=[],outside=[],aisleOccupancy=[],supportContacts=[],pairOverlaps=[],chairTablePairs=[];
 let groundFurniturePairChecks=0,chairTablePairChecks=0,minimumChairTablePlanGap=Infinity;
 for(const f of footprints){
  const name=f.objectName||f.nodeName||f.name||f.id,record=editable.find(r=>r.name===name||r.node.extras.objectId===name);
  if(!record){issues.push({kind:'footprint-object-missing',id:f.id,name});continue;}
  const actual=boxRect(record.bounds),declared=asRect(f),groundFurniture=record.node.extras.groundFurniture===true;matched.push({id:f.id||name,name:record.name,role:record.node.extras.role||f.role||f.kind,groundFurniture,record,declared,actual,metadata:f});
  if(!finiteRect(declared,!groundFurniture))issues.push({kind:'invalid-declared-footprint',id:f.id});
  if(!inside(actual)){const entry={name:record.name,worldBounds:serializeBounds(record.bounds)};outside.push(entry);issues.push({kind:'furniture-outside-floor',...entry});}
  if(groundFurniture)for(const a of aisles)if(overlaps(actual,a)){const entry={name:record.name,aisle:a.id,actualBounds:actual};aisleOccupancy.push(entry);issues.push({kind:'furniture-in-aisle',...entry});}
 }
 // Test disjoint editable objects at the object level, then inspect their
 // constituent mesh AABBs to distinguish empty table-under-space from solids.
 // Objects installed on another object are checked as supported equipment.
 const supportOf=r=>r.node.extras.supportObject||r.node.extras.supportedBy||r.node.extras.support||null;
 for(const top of editable.filter(r=>supportOf(r))){
  const support=supportOf(top),base=records.find(r=>r.name===support||r.node.extras?.objectId===support);
  if(!base){issues.push({kind:'equipment-support-missing',object:top.name,support});continue;}
  if(!base.node.extras?.editableObject){
   const walls=base.descendantMeshes.filter(r=>{const size=r.ownBounds.getSize(new THREE.Vector3());return size.y>.5&&Math.max(size.x,size.z)>1&&Math.min(size.x,size.z)<.3;});
   const distances=walls.map(w=>{const b=w.ownBounds,t=top.bounds,dx=Math.max(b.min.x-t.max.x,t.min.x-b.max.x,0),dy=Math.max(b.min.y-t.max.y,t.min.y-b.max.y,0),dz=Math.max(b.min.z-t.max.z,t.min.z-b.max.z,0);return{wall:w.name,distance:Math.hypot(dx,dy,dz)};}).sort((a,b)=>a.distance-b.distance),closest=distances[0];
   const contact={object:top.name,support:base.name,surfaceBasis:'actual-vertical-wall-mesh-AABB',closestWall:closest?.wall||null,wallGap:round(closest?.distance),allowedGap:.12};supportContacts.push(contact);
   if(!closest||closest.distance>.12)issues.push({kind:'wall-mounted-object-away-from-support',...contact});
   continue;
  }
  const t=boxRect(top.bounds),b=boxRect(base.bounds),surfaceY=top.node.extras.supportSurfaceY??base.node.extras.supportSurfaceY??base.bounds.max.y;
  const verticalDifference=top.bounds.min.y-surfaceY,contained=t.minX>=b.minX-EPS&&t.maxX<=b.maxX+EPS&&t.minZ>=b.minZ-EPS&&t.maxZ<=b.maxZ+EPS;
  const supportGeometryTop=base.bounds.max.y,surfaceMetadataDifference=surfaceY-supportGeometryTop;
  const contact={object:top.name,support:base.name,supportSurfaceY:round(surfaceY),actualSupportTop:round(supportGeometryTop),surfaceMetadataDifference:round(surfaceMetadataDifference),surfaceBasis:top.node.extras.supportSurfaceY!==undefined||base.node.extras.supportSurfaceY!==undefined?'explicit-metadata':'support-object-AABB-top',verticalDifference:round(verticalDifference),contained};supportContacts.push(contact);
  if(Math.abs(surfaceMetadataDifference)>.002+EPS)issues.push({kind:'declared-support-height-does-not-match-geometry',...contact});
  if(!contained||verticalDifference< -EPS||verticalDifference>.002+EPS)issues.push({kind:'invalid-equipment-support',...contact});
 }
 for(let i=0;i<matched.length;i++)for(let j=0;j<i;j++){
  const a=matched[i],b=matched[j];
  if(a.groundFurniture&&b.groundFurniture){groundFurniturePairChecks++;if(/chair|stool|seat/i.test(a.role)&&/table|counter/i.test(b.role)||/chair|stool|seat/i.test(b.role)&&/table|counter/i.test(a.role)){chairTablePairChecks++;const dx=Math.max(a.actual.minX-b.actual.maxX,b.actual.minX-a.actual.maxX,0),dz=Math.max(a.actual.minZ-b.actual.maxZ,b.actual.minZ-a.actual.maxZ,0);minimumChairTablePlanGap=Math.min(minimumChairTablePlanGap,Math.hypot(dx,dz));}}
  if(!overlaps(a.actual,b.actual))continue;
  const aSupport=supportOf(a.record),bSupport=supportOf(b.record);
  if(aSupport===b.name||bSupport===a.name)continue;
  if(!a.groundFurniture||!b.groundFurniture)continue;
  const componentHits=[];
  for(const ma of a.record.descendantMeshes)for(const mb of b.record.descendantMeshes){const depth=overlap3D(ma.ownBounds,mb.ownBounds);if(depth)componentHits.push({a:ma.name,b:mb.name,depth});}
  const entry={a:a.name,b:b.name,roles:[a.role,b.role],planOverlap:{x:round(Math.min(a.actual.maxX,b.actual.maxX)-Math.max(a.actual.minX,b.actual.minX)),z:round(Math.min(a.actual.maxZ,b.actual.maxZ)-Math.max(a.actual.minZ,b.actual.minZ))},componentOverlaps:componentHits};
  if(/chair|stool|seat/i.test(a.role)&&/table|counter/i.test(b.role)||/chair|stool|seat/i.test(b.role)&&/table|counter/i.test(a.role))chairTablePairs.push(entry);
  if(componentHits.length){pairOverlaps.push(entry);issues.push({kind:'furniture-solid-aabb-overlap',...entry});}
 }
 const missingGroundFootprints=editable.filter(r=>r.node.extras.groundFurniture===true&&!matched.some(m=>m.record===r)).map(r=>r.name);
 const checks={rootPresent:true,conceptDimensions:metadata.width===12&&metadata.depth===9&&(metadata.height===3.25||metadata.ceilingHeight===3.25||metadata.designHeight===3.25),supportedGeometry:inspection.unsupported.length===0,finiteGeometry:geometryIssues.length===0,hasFurnitureFootprints:footprints.length>0,hasAuthoredAisles:aisles.length>0,footprintsHaveActualObjects:matched.length===footprints.length,allGroundFurnitureHasFootprint:missingGroundFootprints.length===0,hasGroundFurniture:matched.some(m=>m.groundFurniture),validAisleRectangles:!issues.some(i=>i.kind==='invalid-aisle'),validDeclaredFootprints:!issues.some(i=>i.kind==='invalid-declared-footprint'),supportedEquipmentWithinTolerance:!issues.some(i=>/support/.test(i.kind)),mainFurnitureInsideFloor:outside.length===0,mainFurnitureClearOfAisles:aisleOccupancy.length===0,noUnexplainedFurnitureSolidOverlap:pairOverlaps.length===0};
 for(const[name,passed]of Object.entries(checks))if(!passed&&!issues.some(i=>i.kind===name))issues.push({kind:name});
 return{checkedAt:new Date().toISOString(),file:path.basename(inspection.file),bytes:inspection.bytes.length,sha256:inspection.sha256,passed:issues.length===0,floor,aisles,checks,editableObjects:editable.length,declaredFootprintCount:footprints.length,checkedFurnitureCount:matched.length,groundFurnitureCount:matched.filter(m=>m.groundFurniture).length,groundFurniturePairChecks,chairTablePairChecks,minimumChairTablePlanGap:round(minimumChairTablePlanGap),missingGroundFootprints,readPositionAccessors:inspection.readPositionAccessors,worldBounds:serializeBounds(inspection.bounds),furniture:matched.map(({record,...m})=>({...m,worldBounds:serializeBounds(record.bounds)})),outside,aisleOccupancy,chairTablePairs,supportContacts,supportTolerance:{verticalGapMeters:[0,.002],maximumWallGapMeters:.12,basis:'Supported equipment bottom must be on or at most 2 mm above the declared support surface. Wall-mounted objects use a separate limited proximity check'},pairOverlaps,unsupported:inspection.unsupported,issueCount:issues.length,issues,method:'Reads the exported GLB binary POSITION vertices, including normalized and sparse accessors, and transforms each vertex through the default-scene hierarchy. Authored main-furniture footprints are matched to independent editable objects. Actual object XZ bounds are checked against the concept floor and declared aisles; object overlaps are refined using constituent mesh world AABBs. Explicit support metadata distinguishes mounted equipment and applies the reported surface-gap tolerances.',limitations:['Static furnished café only: no people, attendance controls, event stages, or circulation simulation.','AABBs are conservative; intersecting curved or diagonal mesh bounds can require visual review. Triangle-to-triangle collision and reach envelopes are not evaluated.','Ground-layout checks cover declared furniture footprints; cups, books and other props nested within an object are not treated as separate obstacles.','Tabletop equipment requires a 0 to 0.002 m bottom-to-surface gap; wall mounts have a separate limited proximity screen up to 0.12 m. This is not load, power, plumbing or operating verification.','Authored aisle rectangles do not constitute accessible-route, evacuation, fire, structural or occupancy approval.']};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const inspection=inspectGLB(path.resolve(process.argv[2]||path.join(here,'../cafe.glb'))),report=validateLayout(inspection);
 fs.writeFileSync(path.join(here,'layout-check.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:report.passed,sha256:report.sha256,editableObjects:report.editableObjects,checkedFurnitureCount:report.checkedFurnitureCount,aisles:report.aisles,checks:report.checks,issueCount:report.issueCount,firstIssues:report.issues.slice(0,15)},null,2));
 if(!report.passed)process.exitCode=1;
}
