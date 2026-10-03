#!/usr/bin/env node
/**
 * Run from any directory:
 *   node scene-template-library/museum/validation/validate.mjs
 *   node validate.mjs /absolute/path/to/museum.glb
 * Uses the existing workspace validator, or GLTF_VALIDATOR_MODULE when moved.
 * No network requests or source-model mutations are performed.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = path.resolve(process.argv[2] || path.join(here, '../museum.glb'));
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
  const record={index,name:node.name || '',worldPosition:[world[12],world[13],world[14]].map(round),bounds:null,node};
  placed.push(record);
  for(const child of node.children || []) merge(bounds,walk(child,world,[...ancestors,index]));
  record.bounds=cleanBounds(bounds);
  return bounds;
}
for(const root of sceneRoots) merge(allBounds,walk(root,identity()));
const visitors=placed.filter(o=>/^Visitor_\d+$/.test(o.name));
const staff=placed.filter(o=>/^Staff_\d+$/.test(o.name));
const names=new Set(placed.map(o=>o.name));
const requiredGroups=['Museum_Architecture','Museum_Exhibition','Museum_Lighting','Museum_Visitors','Museum_Staff'];
const groupChecks=requiredGroups.map(name=>({name,present:names.has(name),bounds:placed.find(o=>o.name===name)?.bounds || null}));
const rootRecord=placed.find(o=>o.node.extras?.defaultVisitors!==undefined);
const metadata=rootRecord?.node.extras || {};
const externalResources=[];
for(const kind of ['buffers','images']) for(const [index,res] of (gltf[kind] || []).entries()) if(res.uri && !res.uri.startsWith('data:')) externalResources.push({kind,index,uri:res.uri});
const embeddedImages=(gltf.images || []).filter(image=>image.bufferView!==undefined || image.uri?.startsWith('data:')).length;
const imageChecks=(gltf.images || []).map((image,index)=>({index,name:image.name || '',mimeType:image.mimeType || null,bufferView:image.bufferView ?? null,embedded:image.bufferView!==undefined || Boolean(image.uri?.startsWith('data:'))}));
const punctualLights=gltf.extensions?.KHR_lights_punctual?.lights || [];
const spotlights=punctualLights.filter(light=>light.type==='spot');
const lightNodes=placed.filter(o=>o.node.extensions?.KHR_lights_punctual).map(o=>({name:o.name,light:o.node.extensions.KHR_lights_punctual.light,worldPosition:o.worldPosition}));
const validatorIssueCodes=Object.fromEntries([...new Set(validation.issues.messages.map(m=>m.code))].map(code=>[code,validation.issues.messages.filter(m=>m.code===code).length]));

// Limited concept layout screen: declared furniture footprints versus human
// proxy circles, including staff. This is not swept-path/crowd/egress analysis.
const radius=0.26, width=metadata.width || 20, depth=metadata.depth || 14;
const footprints=metadata.furnitureFootprints || [];
const collisions=[], outside=[];
const people=[...visitors,...staff];
for(const p of people) {
  const [x,,z]=p.worldPosition;
  if(Math.abs(x)+radius>width/2 || Math.abs(z)+radius>depth/2) outside.push(p.name);
  for(const f of footprints) {
    const dx=Math.max(Math.abs(x-f.x)-f.width/2,0), dz=Math.max(Math.abs(z-f.z)-f.depth/2,0);
    if(dx*dx+dz*dz < radius*radius-1e-8) collisions.push({person:p.name,fixture:f.id,distanceToFootprint:round(Math.hypot(dx,dz))});
  }
}
let minCenterDistance=Infinity;
const personOverlaps=[];
for(let i=0;i<people.length;i++) for(let j=i+1;j<people.length;j++) {
  const a=people[i],b=people[j], distance=Math.hypot(a.worldPosition[0]-b.worldPosition[0],a.worldPosition[2]-b.worldPosition[2]);
  minCenterDistance=Math.min(minCenterDistance,distance);
  if(distance<radius*2-1e-8) personOverlaps.push({a:a.name,b:b.name,distance:round(distance)});
}
const checks={
  glbVersion2:version===2,
  headerLengthMatches:declaredLength===bytes.length,
  validatorNoErrors:validation.issues.numErrors===0,
  validatorNoWarnings:validation.issues.numWarnings===0,
  noExternalResources:externalResources.length===0,
  allImagesEmbedded:embeddedImages===(gltf.images || []).length,
  requiredGroups:groupChecks.every(g=>g.present),
  currentArtGalleryTemplate:metadata.templateId==='art-gallery-space-between-sparse-v2',
  defaultVisitorCount3:visitors.length===3 && metadata.defaultVisitors===3,
  defaultStaffCount1:staff.length===1 && metadata.staff===1,
  actualSpotlights6:spotlights.length===6 && lightNodes.length===6,
  conceptDimensions20x14:metadata.width===20 && metadata.depth===14,
  completePositionBounds:missingPositionBounds.length===0 && unsupportedBounds.length===0,
  finiteSceneBounds:Boolean(cleanBounds(allBounds)),
  humanProxiesInsideConceptFloor:outside.length===0,
  humanProxiesClearOfDeclaredFixtures:collisions.length===0,
  humanProxiesDoNotOverlap:personOverlaps.length===0,
};
const inspection={
  date:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),file:path.basename(file),bytes:bytes.length,sha256,
  format:{magic:'glTF',version,declaredLength,gltfVersion:gltf.asset?.version,generator:gltf.asset?.generator,chunks},
  validator:{version:validator.version(),errors:validation.issues.numErrors,warnings:validation.issues.numWarnings,infos:validation.issues.numInfos,hints:validation.issues.numHints},validatorIssueCodes,
  sceneCount:gltf.scenes?.length || 0,defaultScene,nodeCount:nodes.length,reachableNodes:placed.length,
  uniqueMeshes:meshes.length,meshInstances,primitiveInstances,uniqueMeshTriangles:meshes.reduce((s,m)=>s+m.primitives.reduce((v,p)=>v+triangles(p),0),0),triangleInstances,
  materials:gltf.materials?.length || 0,textures:gltf.textures?.length || 0,images:gltf.images?.length || 0,embeddedImages,imageChecks,externalResources,
  extensionsUsed:gltf.extensionsUsed || [],extensionsRequired:gltf.extensionsRequired || [],
  lighting:{punctualLights:punctualLights.length,spotlights:spotlights.length,lightNodes,definitions:punctualLights},
  groups:groupChecks,visitors:visitors.length,staff:staff.length,
  visitorNodes:visitors.map(({name,worldPosition})=>({name,worldPosition})),staffNodes:staff.map(({name,worldPosition})=>({name,worldPosition})),
  worldBounds:cleanBounds(allBounds),missingPositionBounds,unsupportedBounds,
  conceptDimensions:{width,depth,area:width*depth,units:metadata.units || 'meters',source:'Authored concept metadata; not a surveyed building or certified capacity'},
  rootMetadata:metadata,
  staticOccupancy:{method:'XZ circles of radius 0.26 m against authored axis-aligned fixture footprints; pair distances; floor edge screen',radiusMeters:radius,declaredFixtures:footprints.length,collisions,outside,personOverlaps,minPersonCenterDistance:round(minCenterDistance),limitations:'Conservative static proxy checks only. No dynamic flow, evacuation, accessibility, fire, structural load, lighting photometry or legal compliance verification.'},
  checks,allChecksPass:Object.values(checks).every(Boolean),
  limitations:['World bounds use transformed accessor bounds and may be conservative for rotated geometry.','GLB is the fixed default open-stage snapshot; browser controls and later states are not encoded as animation.','Format and limited geometric checks are not an on-site safety or legal review.'],
};
await fs.writeFile(path.join(here,'model-inspection.json'),JSON.stringify(inspection,null,2)+'\n');
console.log(JSON.stringify({file:inspection.file,bytes:inspection.bytes,sha256,validator:inspection.validator,nodes:inspection.nodeCount,meshInstances,triangleInstances,visitors:visitors.length,staff:staff.length,embeddedImages,externalResources:externalResources.length,worldBounds:inspection.worldBounds,checks},null,2));
if(!inspection.allChecksPass) process.exitCode=1;
