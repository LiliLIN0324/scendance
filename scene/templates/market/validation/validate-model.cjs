#!/usr/bin/env node
'use strict';

// Run from any directory: node /absolute/path/to/validation/validate-model.cjs [market.glb]
// Uses only Node built-ins and the bundled, previously installed gltf-validator package.
// No browser, network, source-model execution, or npm installation is required.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const validator = require(path.resolve(__dirname, '../vendor/gltf-validator'));
const modelPath = path.resolve(process.argv[2] || path.join(__dirname, '../market.glb'));
const outputDir = __dirname;
const EPS = 1e-4;
const round = n => Math.round(n * 1e6) / 1e6;
const identity = () => [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
const multiply = (a, b) => a.map(row => b[0].map((_, j) => row.reduce((s, v, k) => s + v * b[k][j], 0)));
const transform = (m, p) => m.slice(0, 3).map(row => row.reduce((s, v, j) => s + v * (j === 3 ? 1 : p[j]), 0));
const emptyBounds = () => ({ min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] });
function addPoint(b, p) { for (let i = 0; i < 3; i++) { b.min[i] = Math.min(b.min[i], p[i]); b.max[i] = Math.max(b.max[i], p[i]); } }
function union(a, b) { if (Number.isFinite(b.min[0])) { addPoint(a, b.min); addPoint(a, b.max); } }
function serializeBounds(b) { return Number.isFinite(b.min[0]) ? { min: b.min.map(round), max: b.max.map(round), size: b.max.map((v, i) => round(v - b.min[i])) } : null; }
function nodeMatrix(n) {
  if (n.matrix) return Array.from({ length: 4 }, (_, i) => Array.from({ length: 4 }, (_, j) => n.matrix[j * 4 + i]));
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1], [sx, sy, sz] = n.scale || [1, 1, 1], [tx, ty, tz] = n.translation || [0, 0, 0];
  return [[(1 - 2*y*y - 2*z*z)*sx, (2*x*y - 2*z*w)*sy, (2*x*z + 2*y*w)*sz, tx], [(2*x*y + 2*z*w)*sx, (1 - 2*x*x - 2*z*z)*sy, (2*y*z - 2*x*w)*sz, ty], [(2*x*z - 2*y*w)*sx, (2*y*z + 2*x*w)*sy, (1 - 2*x*x - 2*y*y)*sz, tz], [0, 0, 0, 1]];
}
function parseGLB(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw Error('Invalid glTF 2.0 GLB header or declared byte length');
  let json, binary;
  for (let offset = 12; offset < bytes.length;) {
    const length = bytes.readUInt32LE(offset), type = bytes.readUInt32LE(offset + 4), end = offset + 8 + length;
    if (end > bytes.length) throw Error('GLB chunk exceeds file length');
    if (type === 0x4e4f534a) json = JSON.parse(bytes.toString('utf8', offset + 8, end).replace(/[\u0000 ]+$/, ''));
    if (type === 0x004e4942) binary = bytes.subarray(offset + 8, end);
    offset = end;
  }
  if (!json || !binary) throw Error('JSON or BIN chunk missing');
  return { json, binary };
}
function rect(r) { return { minX: r.x-r.width/2, maxX: r.x+r.width/2, minZ: r.z-r.depth/2, maxZ: r.z+r.depth/2 }; }
function overlapRect(a, b) {
  const ar=rect(a), br=rect(b), x=Math.min(ar.maxX,br.maxX)-Math.max(ar.minX,br.minX), z=Math.min(ar.maxZ,br.maxZ)-Math.max(ar.minZ,br.minZ);
  return x > EPS && z > EPS ? { width: round(x), depth: round(z), area: round(x*z) } : null;
}
function writeJSON(name, obj) { fs.writeFileSync(path.join(outputDir, name), JSON.stringify(obj, null, 2)+'\n'); }

async function main() {
  if (!fs.existsSync(modelPath)) { console.error(`GLB not found: ${modelPath}\nExport the scene first, then rerun this command. No polling was started.`); process.exitCode=2;return; }
  const bytes=fs.readFileSync(modelPath), sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const official=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(modelPath),maxIssues:0});
  writeJSON('gltf-validator.json',official);
  const {json:g,binary}=parseGLB(bytes), nodes=g.nodes||[], meshes=g.meshes||[], accessors=g.accessors||[], buffers=g.buffers||[], views=g.bufferViews||[];
  const externalResources=[];
  for (const kind of ['buffers','images']) (g[kind]||[]).forEach((o,index)=>{if(o.uri&&!o.uri.startsWith('data:'))externalResources.push({kind,index,uri:o.uri});});
  if (externalResources.length) throw Error('Independent vertex reader requires self-contained GLB; see validator report for external resources');
  if (buffers.length!==1 || buffers[0].uri) throw Error('Independent reader requires one embedded GLB buffer');
  const components={5120:['readInt8',1,127],5121:['readUInt8',1,255],5122:['readInt16LE',2,32767],5123:['readUInt16LE',2,65535],5125:['readUInt32LE',4,4294967295],5126:['readFloatLE',4,1]};
  const widths={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT2:4,MAT3:9,MAT4:16}, accessorCache=new Map();
  function readAccessor(index) {
    if(accessorCache.has(index))return accessorCache.get(index);
    const a=accessors[index], info=components[a.componentType], width=widths[a.type];if(!info||!width)throw Error(`Unsupported accessor ${index}`);
    const [reader,size,max]=info,result=Array.from({length:a.count},()=>Array(width).fill(0));
    function value(offset){const v=binary[reader](offset);return a.normalized?Math.max(-1,v/max):v;}
    if(a.bufferView!==undefined){const bv=views[a.bufferView];if(bv.buffer!==0)throw Error('Nonzero buffer reference');const stride=bv.byteStride||width*size,start=(bv.byteOffset||0)+(a.byteOffset||0);for(let i=0;i<a.count;i++)for(let c=0;c<width;c++)result[i][c]=value(start+i*stride+c*size);}
    if(a.sparse){const s=a.sparse,ib=views[s.indices.bufferView],vb=views[s.values.bufferView],[ir,is]=components[s.indices.componentType],startI=(ib.byteOffset||0)+(s.indices.byteOffset||0),startV=(vb.byteOffset||0)+(s.values.byteOffset||0);for(let i=0;i<s.count;i++){const row=binary[ir](startI+i*is);for(let c=0;c<width;c++)result[row][c]=value(startV+(i*width+c)*size);}}
    if(result.some(row=>row.some(n=>!Number.isFinite(n))))throw Error(`Nonfinite accessor values: ${index}`);
    accessorCache.set(index,result);return result;
  }
  const active=[],records=new Map(),leafMeshes=[],unsupported=[],sceneBounds=emptyBounds();let meshInstances=0,primitiveInstances=0,triangleInstances=0,vertexInstances=0;
  function walk(index,parent,ancestors=[]) {
    if(ancestors.includes(index))throw Error('Cycle in node hierarchy');
    const n=nodes[index],world=multiply(parent,nodeMatrix(n)),bounds=emptyBounds(),record={index,name:n.name||`node_${index}`,parent:ancestors.at(-1)??null,worldPosition:transform(world,[0,0,0]),world,bounds};active.push(index);records.set(index,record);
    if(n.skin!==undefined || n.weights || n.extensions?.EXT_mesh_gpu_instancing)unsupported.push({node:index,name:n.name,reason:'Skinned, morphed or GPU-instanced geometry requires a specialized pose evaluation'});
    if(n.mesh!==undefined){meshInstances++;for(const p of meshes[n.mesh].primitives){primitiveInstances++;if(p.targets)unsupported.push({node:index,reason:'Morph targets'});const points=readAccessor(p.attributes.POSITION),count=p.indices!==undefined?accessors[p.indices].count:points.length,mode=p.mode??4;vertexInstances+=points.length;triangleInstances+=mode===4?count/3:[5,6].includes(mode)?Math.max(0,count-2):0;for(const point of points)addPoint(bounds,transform(world,point));}leafMeshes.push(record);}
    for(const child of n.children||[])union(bounds,walk(child,world,[...ancestors,index]));
    return bounds;
  }
  const scene=g.scenes[g.scene??0];for(const root of scene.nodes||[])union(sceneBounds,walk(root,identity()));
  const findName=name=>[...records.values()].find(r=>r.name===name), root=[...records.values()].find(r=>nodes[r.index].extras?.templateId==='outdoor-market-30x22-v1');
  if(!root)throw Error('Market root extras missing');
  const extras=nodes[root.index].extras, footprints=extras.furnitureFootprints, aisles=extras.aisles;
  for(const key of ['furnitureFootprints','aisles','openSpots','eveningSpots'])if(!Array.isArray(extras[key]))throw Error(`Required root extras missing: ${key}`);
  const visitors=[...records.values()].filter(r=>/^Visitor_\d+$/.test(r.name)), vendors=[...records.values()].filter(r=>/^Vendor_\d+$/.test(r.name)), stalls=[...records.values()].filter(r=>/^Stall_\d+$/.test(r.name));
  const countChecks={visitors:visitors.length===0,vendors:vendors.length===0,totalPeople:visitors.length+vendors.length===0,stalls:stalls.length===12,peopleExcluded:extras.peopleIncluded===false,declaredVisitors:extras.defaultVisitors===0,declaredVendors:extras.vendors===0,noOpenSpots:extras.openSpots.length===0,noEveningSpots:extras.eveningSpots.length===0,stallGroup:stalls.every(r=>r.parent===findName('Market_Stalls')?.index)};
  const halfX=extras.width/2,halfZ=extras.depth/2;
  function outsideRect(r){const b=rect(r);return b.minX < -halfX-EPS || b.maxX > halfX+EPS || b.minZ < -halfZ-EPS || b.maxZ > halfZ+EPS;}
  const footprintOutside=footprints.filter(outsideRect).map(r=>({id:r.id,bounds:rect(r)})), footprintOverlaps=[],furnitureInAisles=[];
  for(let i=0;i<footprints.length;i++){
    for(let j=i+1;j<footprints.length;j++){const overlap=overlapRect(footprints[i],footprints[j]);if(overlap){const ids=[footprints[i].id,footprints[j].id];const stageStep=ids.includes('stage')&&ids.includes('stage-step');const chairTable=ids.some(s=>s.startsWith('Asset_table_'))&&ids.some(s=>s.startsWith('Asset_chair_'));footprintOverlaps.push({a:ids[0],b:ids[1],...overlap,classification:stageStep?'expected-stage-step-contact':chairTable?'manual-review-dining-table-chair':'unexplained',explanation:stageStep?'The stage step intentionally meets the platform; 2D rectangles overlap at that joint. This planned contact is recorded separately from unexplained overlaps.':chairTable?'Review 3D heights and chair placement manually; a plan-view overlap alone cannot prove or exclude a physical collision.':null});}}
    for(const a of aisles){const overlap=overlapRect(footprints[i],a);if(overlap)furnitureInAisles.push({footprint:footprints[i].id,aisle:a.id,...overlap});}
  }
  const peopleChecks={applicable:false,reason:'People have been removed at the user request. Visitor collision, phase-position and vendor clearance checks do not apply; absence of visitor/vendor nodes and empty position lists are asserted in countChecks.'};
  const footprintGeometryChecks=footprints.flatMap(f=>{const n=findName(f.id);if(!n)return [];const b=n.bounds,fb=rect(f);return [{id:f.id,category:f.category,declared:rect(f),geometryXZ:{minX:round(b.min[0]),maxX:round(b.max[0]),minZ:round(b.min[2]),maxZ:round(b.max[2])},maxDifferenceMeters:round(Math.max(Math.abs(fb.minX-b.min[0]),Math.abs(fb.maxX-b.max[0]),Math.abs(fb.minZ-b.min[2]),Math.abs(fb.maxZ-b.max[2])))}];});
  const geometryOutside=leafMeshes.filter(r=>r.bounds.min[0]<-halfX-.001||r.bounds.max[0]>halfX+.001||r.bounds.min[2]<-halfZ-.001||r.bounds.max[2]>halfZ+.001).map(r=>({name:r.name,node:r.index,bounds:serializeBounds(r.bounds),classification:r.name.startsWith('TreeCrown_')?'canopy-overhang':r.bounds.max[1]<.1?'ground-level-dimension-annotation':'review-required'}));
  const embeddedImages=(g.images||[]).map((im,i)=>({index:i,name:im.name||null,mimeType:im.mimeType||null,storage:im.bufferView!==undefined?'GLB-bufferView':im.uri?.startsWith('data:')?'data-URI':'external',byteLength:im.bufferView!==undefined?views[im.bufferView].byteLength:null}));
  const manualReview=footprintOverlaps.filter(o=>o.classification!=='expected-stage-step-contact');
  const hardFailures=[];
  if(official.issues.numErrors)hardFailures.push('Khronos validator errors');
  if(official.issues.truncated)hardFailures.push('Khronos validator report truncated');
  if(Object.values(countChecks).some(v=>!v))hardFailures.push('Scene count/group mismatch');
  if(unsupported.length)hardFailures.push('Unsupported animated/skinned/instanced geometry');
  if(footprintOutside.length)hardFailures.push('Footprints outside assumed site');
  if(furnitureInAisles.length)hardFailures.push('Furniture occupies reserved aisle');
  if(manualReview.some(o=>o.classification==='unexplained'))hardFailures.push('Unexplained material footprint overlap');
  if(geometryOutside.some(o=>o.classification==='review-required'))hardFailures.push('Unexplained geometry outside site');
  const basis={file:path.basename(modelPath),sha256,bytes:bytes.length,checkedAt:new Date().toISOString(),coordinateSystem:'glTF Y-up, metres',scope:'Static concept layout only. The model includes no visitors or vendors; dimensions are design assumptions. This is not site measurement, pedestrian simulation, fire approval, structural, weather, or event-operating verification.'};
  writeJSON('geometry-report.json',{...basis,gltfVersion:g.asset.version,sceneCount:g.scenes.length,nodeCount:nodes.length,activeNodeCount:active.length,uniqueMeshCount:meshes.length,meshInstances,primitiveInstances,triangleInstances,vertexInstances,materials:g.materials?.length||0,textures:g.textures?.length||0,embeddedImages,externalResources,extensionsUsed:g.extensionsUsed||[],extensionsRequired:g.extensionsRequired||[],unsupported,worldBounds:serializeBounds(sceneBounds),counts:{visitors:visitors.length,vendors:vendors.length,totalPeople:visitors.length+vendors.length,stalls:stalls.length},countChecks,geometryOutside,nodeBounds:[...records.values()].map(r=>({node:r.index,name:r.name,parent:r.parent,worldPosition:r.worldPosition.map(round),worldBounds:serializeBounds(r.bounds)}))});
  writeJSON('layout-validation.json',{...basis,site:{width:extras.width,depth:extras.depth,area:extras.area},currentPhase:extras.currentPhase,footprintCount:footprints.length,aisleCount:aisles.length,method:{people:'Not applicable: no people are included in this version.',furniture:'Declared ground occupancy only; overhead parasol canopies are excluded in favor of their base footprints. Not all small props have footprints.',geometry:'Actual binary POSITION accessors, normalized integers, sparse updates, node transforms and scene hierarchy are evaluated without executing model.js. No skin/morph pose interpretation.',limits:'Ground footprint checks do not model human motion, reachable clearance or legal capacity. Thin parts and overhead elements require visual review.'},footprintOutside,footprintOverlaps,furnitureInAisles,peopleChecks,footprintGeometryChecks,geometryOutside,manualReview,hardFailures,passed:hardFailures.length===0});
  const summary={...basis,validatorVersion:validator.version(),gltfValidator:{errors:official.issues.numErrors,warnings:official.issues.numWarnings,infos:official.issues.numInfos,hints:official.issues.numHints,truncated:official.issues.truncated},geometry:{nodes:nodes.length,meshInstances,triangles:triangleInstances,embeddedImages:embeddedImages.length,externalResources:externalResources.length},counts:{visitors:visitors.length,vendors:vendors.length,stalls:stalls.length},layout:{people:'not-applicable',furnitureInAisles:furnitureInAisles.length,footprintsOutside:footprintOutside.length,footprintOverlaps:footprintOverlaps.length,manualReview:manualReview.length,geometryOutside:geometryOutside.length},hardFailures,passed:hardFailures.length===0};
  writeJSON('model-validation-summary.json',summary);console.log(JSON.stringify(summary,null,2));if(hardFailures.length)process.exitCode=1;
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
