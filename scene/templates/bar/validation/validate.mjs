#!/usr/bin/env node
/**
 * Run from any directory:
 *   node scene-template-library/bar/validation/validate.mjs
 *   node validate.mjs /absolute/path/to/bar.glb
 * Uses the existing workspace validator, or GLTF_VALIDATOR_MODULE when moved.
 * No network requests or source-model mutations are performed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(process.argv[2] || path.join(here, '../bar.glb'));
const require = createRequire(import.meta.url);
const modulePath = process.env.GLTF_VALIDATOR_MODULE || path.resolve(here, '../../../scendance-frontend/node_modules/gltf-validator');
let validator;
try { validator = require(modulePath); }
catch {
  try { validator = require('gltf-validator'); }
  catch { throw new Error('glTF Validator not found. Set GLTF_VALIDATOR_MODULE to an existing gltf-validator package directory. The standalone preview itself needs no validator.'); }
}

const bytes = await fs.readFile(file);
const sha256 = createHash('sha256').update(bytes).digest('hex');
if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF') throw new Error('Not a GLB file');
const version = bytes.readUInt32LE(4);
const declaredLength = bytes.readUInt32LE(8);
const chunks = [];
let gltf;
for (let offset = 12; offset < bytes.length;) {
  if (offset + 8 > bytes.length) throw new Error('Truncated GLB chunk header');
  const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4);
  if (offset + 8 + length > bytes.length) throw new Error('Truncated GLB chunk payload');
  chunks.push({ type: type === 0x4e4f534a ? 'JSON' : type === 0x004e4942 ? 'BIN' : type, bytes: length });
  if (type === 0x4e4f534a) gltf = JSON.parse(bytes.toString('utf8', offset + 8, offset + 8 + length).trim());
  offset += 8 + length;
}
if (!gltf) throw new Error('GLB has no JSON chunk');

const validation = await validator.validateBytes(new Uint8Array(bytes), {
  uri: path.basename(file), format: 'glb', maxIssues: 0,
  externalResourceFunction: async uri => { throw new Error(`Unexpected external resource: ${uri}`); },
});
await fs.writeFile(path.join(here, 'gltf-validation.json'), JSON.stringify(validation, null, 2) + '\n');

// Column-major matrices, matching glTF. Bounds transform all eight corners
// of each POSITION accessor AABB; they are conservative for rotated meshes.
const identity = () => [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
function multiply(a,b) {
  const out=Array(16).fill(0);
  for(let c=0;c<4;c++) for(let r=0;r<4;r++) for(let k=0;k<4;k++) out[c*4+r]+=a[k*4+r]*b[c*4+k];
  return out;
}
function localMatrix(node) {
  if(node.matrix) return node.matrix;
  const [x,y,z,w]=node.rotation || [0,0,0,1];
  const [sx,sy,sz]=node.scale || [1,1,1];
  const [tx,ty,tz]=node.translation || [0,0,0];
  return [
    (1-2*(y*y+z*z))*sx, 2*(x*y+z*w)*sx, 2*(x*z-y*w)*sx, 0,
    2*(x*y-z*w)*sy, (1-2*(x*x+z*z))*sy, 2*(y*z+x*w)*sy, 0,
    2*(x*z+y*w)*sz, 2*(y*z-x*w)*sz, (1-2*(x*x+y*y))*sz, 0,
    tx,ty,tz,1,
  ];
}
const transform=(m,p)=>[m[0]*p[0]+m[4]*p[1]+m[8]*p[2]+m[12],m[1]*p[0]+m[5]*p[1]+m[9]*p[2]+m[13],m[2]*p[0]+m[6]*p[1]+m[10]*p[2]+m[14]];
const emptyBounds=()=>({min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]});
function expand(box,point) { for(let i=0;i<3;i++) {box.min[i]=Math.min(box.min[i],point[i]);box.max[i]=Math.max(box.max[i],point[i]);} }
function merge(box,other) {if(Number.isFinite(other.min[0])) {expand(box,other.min);expand(box,other.max);} }
function cleanBounds(box) {return Number.isFinite(box.min[0]) ? {min:box.min.map(round),max:box.max.map(round),size:box.max.map((v,i)=>round(v-box.min[i]))} : null;}
function round(x) {return Math.round(x*1e6)/1e6;}
function triangles(primitive) {
  const accessor=gltf.accessors?.[primitive.indices ?? primitive.attributes?.POSITION];
  const n=accessor?.count || 0, mode=primitive.mode ?? 4;
  return mode===4 ? n/3 : (mode===5||mode===6) ? Math.max(0,n-2) : 0;
}
const nodes=gltf.nodes || [], meshes=gltf.meshes || [];
const defaultScene=gltf.scene ?? 0;
const sceneRoots=gltf.scenes?.[defaultScene]?.nodes || [];
const placed=[], missingPositionBounds=[], unsupportedBounds=[];
const allBounds=emptyBounds();
let meshInstances=0, triangleInstances=0, primitiveInstances=0;
function walk(index,parent,ancestors=[]) {
  if(ancestors.includes(index)) throw new Error('Cycle in scene hierarchy');
  const node=nodes[index], world=multiply(parent,localMatrix(node)), bounds=emptyBounds();
  if(node.skin!==undefined || node.weights || node.extensions?.EXT_mesh_gpu_instancing) unsupportedBounds.push({index,name:node.name,reason:'Skin, morph or GPU instancing requires evaluated geometry; static accessor bounds are insufficient.'});
  if(node.mesh!==undefined) {
    meshInstances++;
    for(const [p,primitive] of (meshes[node.mesh]?.primitives || []).entries()) {
      primitiveInstances++; triangleInstances+=triangles(primitive);
      const a=gltf.accessors?.[primitive.attributes?.POSITION];
      if(!a?.min || !a?.max) {missingPositionBounds.push({node:index,primitive:p});continue;}
      const normalized=v=>!a.normalized?v:a.componentType===5120?Math.max(v/127,-1):a.componentType===5121?v/255:a.componentType===5122?Math.max(v/32767,-1):a.componentType===5123?v/65535:v;
      for(let c=0;c<8;c++) expand(bounds,transform(world,[c&1?a.max[0]:a.min[0],c&2?a.max[1]:a.min[1],c&4?a.max[2]:a.min[2]].map(normalized)));
    }
  }
  const record={index,ancestors:[...ancestors],name:node.name || '',worldPosition:[world[12],world[13],world[14]].map(round),bounds:null,node};
  placed.push(record);
  for(const child of node.children || []) merge(bounds,walk(child,world,[...ancestors,index]));
  record.bounds=cleanBounds(bounds);
  return bounds;
}
for(const root of sceneRoots) merge(allBounds,walk(root,identity()));
const expectedRoot='Bar_AmberRoom_12x9';
const rootRecord=placed.find(o=>o.name===expectedRoot);
const metadata=rootRecord?.node.extras || {};
const width=metadata.floorWidth ?? metadata.width, depth=metadata.floorDepth ?? metadata.depth;
const nameCounts=new Map();for(const node of nodes)if(node.name)nameCounts.set(node.name,(nameCounts.get(node.name)||0)+1);
const duplicateNames=[...nameCounts].filter(([,count])=>count>1).map(([name,count])=>({name,count}));
const unnamedNodes=nodes.flatMap((n,index)=>!n.name?[index]:[]);
const names=new Set(placed.map(o=>o.name));
const requiredGroups=['Bar_Structure','Bar_Furniture','Bar_Equipment','Bar_Lighting','Bar_Roof'];
const groupChecks=requiredGroups.map(name=>({name,present:names.has(name),bounds:placed.find(o=>o.name===name)?.bounds || null}));
const forbiddenPeople=nodes.flatMap((n,index)=>/(^|[_\s-])(Visitor|Staff|Person|People|Human|Customer|Guest)([_\s-]|\d|$)/i.test(n.name||'') || ['visitor','staff','person','human','customer','guest'].includes(n.extras?.role) ? [{index,name:n.name,role:n.extras?.role}] : []);
const inventory=Array.isArray(metadata.inventory)?metadata.inventory:[];
const inventoryNames=inventory.map(item=>item.name || item.nodeName);
const inventoryDuplicates=[...new Set(inventoryNames)].filter(name=>inventoryNames.filter(n=>n===name).length>1);
const inventoryChecks=inventory.map(item=>{
  const name=item.name || item.nodeName, candidates=placed.filter(o=>o.name===name), node=candidates[0];
  const expectedParent=item.layer ? `Bar_${item.layer}` : null;
  const parent=node?.ancestors.length ? nodes[node.ancestors.at(-1)]?.name : null;
  const descendants=node?placed.filter(o=>o.index===node.index || o.ancestors.includes(node.index)):[];
  const descendantMeshCount=descendants.filter(o=>o.node.mesh!==undefined).length;
  const descendantLightCount=descendants.filter(o=>o.node.extensions?.KHR_lights_punctual).length;
  const nestedInventory=descendants.filter(o=>o.index!==node?.index && inventoryNames.includes(o.name)).map(o=>o.name);
  const namingValid=/^Bar_[A-Za-z][A-Za-z0-9_]*_\d{3}$/.test(name||'');
  const editableObject=node?.node.extras?.editableObject===true;
  const pass=candidates.length===1 && namingValid && editableObject && (!expectedParent || parent===expectedParent) && descendantMeshCount+descendantLightCount>0 && nestedInventory.length===0;
  return {name,role:item.role,layer:item.layer,nodeIndex:node?.index ?? null,parent,occurrences:candidates.length,namingValid,editableObject,descendantMeshCount,descendantLightCount,nestedInventory,worldPosition:node?.worldPosition,bounds:node?.bounds,pass};
});
const authoredEditable=placed.filter(o=>o.node.extras?.editableObject===true);
const unlistedEditable=authoredEditable.filter(o=>!inventoryNames.includes(o.name)).map(o=>o.name);
const inventoryRoleCounts={};for(const item of inventory)inventoryRoleCounts[item.role]=(inventoryRoleCounts[item.role]||0)+1;
const declaredCountsMatch=metadata.counts && Object.keys(metadata.counts).length===Object.keys(inventoryRoleCounts).length && Object.entries(inventoryRoleCounts).every(([role,count])=>metadata.counts[role]===count);
const externalResources=[];
for(const kind of ['buffers','images'])for(const [index,res]of(gltf[kind]||[]).entries())if(res.uri&&!res.uri.startsWith('data:'))externalResources.push({kind,index,uri:res.uri});
const imageChecks=(gltf.images||[]).map((res,index)=>({index,name:res.name||'',mimeType:res.mimeType||null,bufferView:res.bufferView??null,embedded:res.bufferView!==undefined||Boolean(res.uri?.startsWith('data:'))}));
const embeddedImages=imageChecks.filter(image=>image.embedded).length;
const punctualLights=gltf.extensions?.KHR_lights_punctual?.lights || [];
const lightNodes=placed.filter(o=>o.node.extensions?.KHR_lights_punctual).map(o=>({name:o.name,light:o.node.extensions.KHR_lights_punctual.light,worldPosition:o.worldPosition}));
const validatorIssueCodes=Object.fromEntries([...new Set(validation.issues.messages.map(m=>m.code))].map(code=>[code,validation.issues.messages.filter(m=>m.code===code).length]));

// Only explicitly declared floor fixtures participate in this static layout
// screen. Bar-top glasses, bottles, pendant lights and contained equipment are
// not assumed to occupy the walking floor. Deliberate footprint overlaps must
// be declared by object name in allowOverlapWith on either of the two records.
const rawFootprints=metadata.furnitureFootprints || metadata.footprints || [];
const footprints=rawFootprints.map((f,index)=>({...f,id:f.id || f.name || f.nodeName || `footprint-${index+1}`,width:f.width ?? f.w,depth:f.depth ?? f.d}));
const footprintIds=footprints.map(f=>f.id);
const duplicateFootprintIds=[...new Set(footprintIds)].filter(id=>footprintIds.filter(v=>v===id).length>1);
const footprintNodeChecks=footprints.map(f=>({id:f.id,nodeName:f.nodeName || f.name || f.id,present:inventoryNames.includes(f.nodeName || f.name || f.id)}));
const invalidFootprints=footprints.filter(f=>![f.x,f.z,f.width,f.depth].every(Number.isFinite) || f.width<=0 || f.depth<=0).map(f=>f.id);
const floorFixtures=footprints.filter(f=>!invalidFootprints.includes(f.id) && f.floorSolid!==false && f.checkOverlap!==false && !f.excludeFromFloorCheck);
const excludedFootprints=footprints.filter(f=>!floorFixtures.includes(f)).map(f=>({id:f.id,reason:f.exclusionReason || 'not declared as a floor-solid fixture'}));
const outsideFloor=[],overlaps=[],allowedOverlaps=[];
for(const f of floorFixtures){
  if(f.x-f.width/2 < -width/2-.025 || f.x+f.width/2 > width/2+.025 || f.z-f.depth/2 < -depth/2-.025 || f.z+f.depth/2 > depth/2+.025)outsideFloor.push(f.id);
}
for(let i=0;i<floorFixtures.length;i++)for(let j=i+1;j<floorFixtures.length;j++){
  const a=floorFixtures[i],b=floorFixtures[j],dx=Math.min(a.x+a.width/2,b.x+b.width/2)-Math.max(a.x-a.width/2,b.x-b.width/2),dz=Math.min(a.z+a.depth/2,b.z+b.depth/2)-Math.max(a.z-a.depth/2,b.z-b.depth/2);
  if(dx>.002 && dz>.002){
    const entry={a:a.id,b:b.id,overlapWidth:round(dx),overlapDepth:round(dz),overlapArea:round(dx*dz)};
    const allowed=(a.allowOverlapWith||[]).includes(b.id)||(b.allowOverlapWith||[]).includes(a.id)||a.allowOverlap===true||b.allowOverlap===true;
    if(allowed)entry.reason=a.overlapReason || b.overlapReason || 'Explicit overlap declared by the author';
    (allowed?allowedOverlaps:overlaps).push(entry);
  }
}
function unionArea(rects){
  const xs=[...new Set(rects.flatMap(f=>[Math.max(-width/2,f.x-f.width/2),Math.min(width/2,f.x+f.width/2)]))].sort((a,b)=>a-b);
  let area=0;
  for(let i=0;i<xs.length-1;i++){
    const left=xs[i],right=xs[i+1];if(right<=left)continue;
    const intervals=rects.filter(f=>f.x-f.width/2<right && f.x+f.width/2>left).map(f=>[Math.max(-depth/2,f.z-f.depth/2),Math.min(depth/2,f.z+f.depth/2)]).filter(p=>p[1]>p[0]).sort((a,b)=>a[0]-b[0]);
    let extent=0,start=null,end=null;
    for(const [a,b]of intervals){if(start===null){start=a;end=b;}else if(a<=end)end=Math.max(end,b);else{extent+=end-start;start=a;end=b;}}
    if(start!==null)extent+=end-start;area+=(right-left)*extent;
  }return round(area);
}
const occupiedArea=unionArea(floorFixtures),floorArea=width*depth;
const checks={
  glbVersion2:version===2,headerLengthMatches:declaredLength===bytes.length,
  validatorNoErrors:validation.issues.numErrors===0,validatorNoWarnings:validation.issues.numWarnings===0,
  expectedRoot:Boolean(rootRecord),expectedTemplate:metadata.templateId==='bar-amber-room-12x9-v1',requiredGroups:groupChecks.every(g=>g.present),
  uniqueNodeNames:duplicateNames.length===0,noUnnamedNodes:unnamedNodes.length===0,
  inventoryPresent:inventory.length>0,uniqueInventoryNames:inventoryDuplicates.length===0,
  allInventoryObjectsIndependent:inventoryChecks.every(item=>item.pass),allEditableObjectsListed:unlistedEditable.length===0,declaredCountsMatch:Boolean(declaredCountsMatch),
  staticUnoccupiedScene:forbiddenPeople.length===0,noAnimations:(gltf.animations||[]).length===0,
  conceptDimensions12x9:width===12 && depth===9,metricYUp:metadata.units==='meters' && metadata.upAxis==='+Y',
  noExternalResources:externalResources.length===0,hasEmbeddedTextures:embeddedImages>0,allImagesEmbedded:embeddedImages===imageChecks.length,
  declaredLightCountMatches:metadata.lightCount===lightNodes.length,
  completePositionBounds:missingPositionBounds.length===0 && unsupportedBounds.length===0,finiteSceneBounds:Boolean(cleanBounds(allBounds)),
  declaredFloorFixtures:floorFixtures.length>0,validFootprints:invalidFootprints.length===0,uniqueFootprintIds:duplicateFootprintIds.length===0,footprintsReferenceInventory:footprintNodeChecks.every(f=>f.present),
  declaredFixturesInsideConceptFloor:outsideFloor.length===0,noUndeclaredFloorFixtureOverlaps:overlaps.length===0,
};
const inspection={
  date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),
  file:path.basename(file),bytes:bytes.length,sha256,
  format:{magic:'glTF',version,declaredLength,gltfVersion:gltf.asset?.version,generator:gltf.asset?.generator,chunks},
  validator:{version:validator.version(),errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,hints:validation.issues.numHints},validatorIssueCodes,
  sceneCount:gltf.scenes?.length||0,defaultScene,nodeCount:nodes.length,reachableNodes:placed.length,
  uniqueMeshes:meshes.length,meshInstances,primitiveInstances,uniqueMeshTriangles:meshes.reduce((sum,m)=>sum+m.primitives.reduce((n,p)=>n+triangles(p),0),0),triangleInstances,
  materials:gltf.materials?.length||0,textures:gltf.textures?.length||0,images:gltf.images?.length||0,embeddedImages,imageChecks,externalResources,
  extensionsUsed:gltf.extensionsUsed||[],extensionsRequired:gltf.extensionsRequired||[],
  lighting:{punctualLights:punctualLights.length,spotlights:punctualLights.filter(light=>light.type==='spot').length,lightNodes,definitions:punctualLights},
  groups:groupChecks,duplicateNames,unnamedNodes,inventoryObjects:inventory.length,editableObjects:authoredEditable.length,inventory,counts:inventoryRoleCounts,inventoryRoleCounts,inventoryChecks,inventoryDuplicates,unlistedEditable,
  visitors:forbiddenPeople.filter(n=>/Visitor|Guest|Customer/i.test(n.name)||['visitor','guest','customer'].includes(n.role)).length,staff:forbiddenPeople.filter(n=>/Staff/i.test(n.name)||n.role==='staff').length,forbiddenPeople,animationCount:gltf.animations?.length||0,
  worldBounds:cleanBounds(allBounds),missingPositionBounds,unsupportedBounds,
  conceptDimensions:{width,depth,area:floorArea,units:metadata.units,upAxis:metadata.upAxis,source:'Authored concept; no measured site or certified capacity'},rootMetadata:metadata,
  staticOccupancy:{method:'Declared floor fixture axis-aligned rectangles, floor boundary screen, exact union of 2D rectangles; intended overlaps must be declared',declaredFootprints:footprints.length,floorFixtures:floorFixtures.length,excludedFootprints,invalidFootprints,duplicateFootprintIds,footprintNodeChecks,outsideFloor,overlaps,allowedOverlaps,occupiedFloorArea:occupiedArea,remainingFloorArea:round(floorArea-occupiedArea),occupiedPercent:round(100*occupiedArea/floorArea),footprints,limitations:'Remaining floor area is a geometric area estimate, not verified walkable circulation. No dynamic flow, furniture swept path, fire, accessibility, load, electrical, photometric or legal compliance verification.'},
  checks,allChecksPass:Object.values(checks).every(Boolean),
  limitations:['World bounds use transformed accessor bounds and may be conservative for rotated geometry.','Independent inventory groups may share mesh geometry and materials; edit clones when changing one instance only.','The GLB is a static scene; camera and visibility adjustments in the preview are not saved to it.','Format and limited geometric checks do not establish site safety, capacity or legal compliance.'],
};
await fs.writeFile(path.join(here,'model-inspection.json'),JSON.stringify(inspection,null,2)+'\n');
await fs.writeFile(path.join(here,'layout-check.json'),JSON.stringify({date:inspection.date,sha256,conceptDimensions:inspection.conceptDimensions,...inspection.staticOccupancy},null,2)+'\n');
console.log(JSON.stringify({file:inspection.file,bytes:inspection.bytes,sha256,validator:inspection.validator,nodes:inspection.nodeCount,meshInstances,triangleInstances,inventoryObjects:inventory.length,inventoryRoleCounts,embeddedImages,externalResources:externalResources.length,worldBounds:inspection.worldBounds,occupancy:{floorFixtures:floorFixtures.length,occupiedFloorArea:occupiedArea,outsideFloor,overlaps},checks},null,2));
if(!inspection.allChecksPass)process.exitCode=1;
