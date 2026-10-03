#!/usr/bin/env node
'use strict';

// Offline verification: node validation/validate-model.cjs [studio.glb]
// Uses only Node built-ins and the bundled Khronos glTF Validator.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const validator = require(path.resolve(__dirname, '../vendor/gltf-validator'));
const modelPath = path.resolve(process.argv[2] || path.join(__dirname, '../studio.glb'));
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
  if (!fs.existsSync(modelPath)) { console.error(`GLB not found: ${modelPath}. Export the studio and rerun; no polling started.`); process.exitCode=2; return; }
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
  const activeRecords=[...records.values()], allNames=new Map();
  for(const record of activeRecords){if(!allNames.has(record.name))allNames.set(record.name,[]);allNames.get(record.name).push(record);}
  const findName=name=>allNames.get(name)?.[0];
  const root=findName('Studio_Photography_12x10');
  if(!root)throw Error('Studio_Photography_12x10 root missing');
  const extras=nodes[root.index].extras||{}, inventory=extras.inventory, declaredCounts=extras.counts, footprints=extras.footprints, corridors=extras.corridors||[];
  if(!Array.isArray(inventory)||!Array.isArray(footprints)||!declaredCounts||typeof declaredCounts!=='object')throw Error('Root inventory, counts or footprints contract is missing');
  const rootNames=['Studio_Structure','Studio_Furniture','Studio_Equipment','Studio_Lighting','Studio_Roof'];
  const groupChecks=rootNames.map(name=>({name,nodeCount:allNames.get(name)?.length||0,directChildOfRoot:findName(name)?.parent===root.index}));
  const personNodes=activeRecords.filter(r=>/(?:^|_)(?:person|people|visitor|vendor|human|avatar|crowd|mannequin)(?:_|$)/i.test(r.name)).map(r=>({node:r.index,name:r.name}));
  const unitChecks={unitsMeters:extras.units==='meters'||extras.units==='metres',upAxisY:['+Y','Y','Y-up'].includes(extras.upAxis),peopleExcluded:extras.peopleIncluded===false,noPersonNodes:personNodes.length===0,width12:extras.width===12,depth10:extras.depth===10};
  const inventoryIssues=[],actualCounts={},seenIds=new Set(),seenNodes=new Set();
  const inventoryChecks=inventory.map((item,index)=>{
    const id=item.id, nodeName=item.nodeName||item.name||item.id, category=item.category, matches=allNames.get(nodeName)||[];
    if(!id||seenIds.has(id))inventoryIssues.push({index,id,reason:'Inventory id missing or duplicated'});seenIds.add(id);
    if(!category)inventoryIssues.push({index,id,reason:'Inventory category missing'});
    if(matches.length!==1)inventoryIssues.push({index,id,nodeName,reason:`Expected exactly one named scene node, found ${matches.length}`});
    const found=matches[0];if(found&&seenNodes.has(found.index))inventoryIssues.push({index,id,nodeName,reason:'Scene node is counted by multiple inventory records'});if(found)seenNodes.add(found.index);
    if(found&&category)actualCounts[category]=(actualCounts[category]||0)+1;
    if(found&&!Number.isFinite(found.bounds.min[0]))inventoryIssues.push({index,id,nodeName,reason:'Inventory node has no mesh geometry'});
    return {id,category,nodeName,nodeFound:matches.length===1,worldBounds:found?serializeBounds(found.bounds):null};
  });
  const countKeys=[...new Set([...Object.keys(declaredCounts),...Object.keys(actualCounts)])];
  const countChecks=countKeys.map(category=>({category,declared:declaredCounts[category]??0,actual:actualCounts[category]??0,passed:Number.isInteger(declaredCounts[category]??0)&&(declaredCounts[category]??0)===(actualCounts[category]??0)}));
  const footprintIssues=[],footprintIds=new Set();
  for(const f of footprints){if(!f.id||footprintIds.has(f.id))footprintIssues.push({id:f.id,reason:'Missing or duplicate footprint id'});footprintIds.add(f.id);if(![f.x,f.z,f.width,f.depth].every(Number.isFinite)||f.width<=0||f.depth<=0)footprintIssues.push({id:f.id,reason:'Footprint requires finite positive dimensions'});}
  const halfX=extras.width/2,halfZ=extras.depth/2;
  function outsideRect(r){const b=rect(r);return b.minX < -halfX-EPS || b.maxX > halfX+EPS || b.minZ < -halfZ-EPS || b.maxZ > halfZ+EPS;}
  // Only explicitly declared floor footprints enter occupancy checks. Props that
  // sit on another item can declare groundOccupancy:false or supportSurface:id.
  const excludedFootprints=footprints.filter(f=>f.groundOccupancy===false||f.supportSurface&&f.supportSurface!=='floor');
  const floorFootprints=footprints.filter(f=>!excludedFootprints.includes(f));
  const footprintOutside=floorFootprints.filter(outsideRect).map(f=>({id:f.id,bounds:rect(f)}));
  function relationship(a,b){
    if(a.ownerId&&a.ownerId===b.ownerId)return {kind:'same-assembly',reason:`Both footprints explicitly belong to ${a.ownerId}`};
    if(a.ownerId===b.id||b.ownerId===a.id)return {kind:'assembly-component',reason:'Component footprint belongs to the other assembly'};
    if(a.allowOverlapWith?.includes(b.id)||b.allowOverlapWith?.includes(a.id))return {kind:'declared-intentional-overlap',reason:a.overlapReason||b.overlapReason||'Explicit allowOverlapWith metadata'};
    return null;
  }
  const footprintOverlaps=[],furnitureInCorridors=[];
  for(let i=0;i<floorFootprints.length;i++){
    for(let j=i+1;j<floorFootprints.length;j++){const a=floorFootprints[i],b=floorFootprints[j],overlap=overlapRect(a,b);if(overlap){const relation=relationship(a,b);footprintOverlaps.push({a:a.id,b:b.id,...overlap,classification:relation?.kind||'review-required',explanation:relation?.reason||'Separate floor footprints overlap; inspect actual 3D shape and intended placement.'});}}
    for(const corridor of corridors){const overlap=overlapRect(floorFootprints[i],corridor);if(overlap)furnitureInCorridors.push({footprint:floorFootprints[i].id,corridor:corridor.id,...overlap});}
  }
  const footprintGeometryChecks=footprints.map(f=>{
    const item=inventory.find(i=>i.id===f.id||i.id===f.ownerId),nodeName=f.nodeName||item?.nodeName||f.id,n=findName(nodeName);
    if(!n)return {id:f.id,nodeName,nodeFound:false,note:'Footprint remains declared metadata; no exact same-name inventory node to compare'};
    const b=n.bounds,fb=rect(f),difference=Math.max(Math.abs(fb.minX-b.min[0]),Math.abs(fb.maxX-b.max[0]),Math.abs(fb.minZ-b.min[2]),Math.abs(fb.maxZ-b.max[2]));
    return {id:f.id,nodeName,nodeFound:true,declared:rect(f),geometryXZ:{minX:round(b.min[0]),maxX:round(b.max[0]),minZ:round(b.min[2]),maxZ:round(b.max[2])},maxDifferenceMeters:round(difference),note:'Ground footprint and whole-device bounds can legitimately differ for raised softboxes, table edges or mounted props; mismatch is reported, not automatically a collision.'};
  });
  function ancestorNames(record){const result=[];let r=record;while(r){result.push(r.name);r=records.get(r.parent);}return result;}
  const geometryOutside=leafMeshes.filter(r=>r.bounds.min[0]<-halfX-.001||r.bounds.max[0]>halfX+.001||r.bounds.min[2]<-halfZ-.001||r.bounds.max[2]>halfZ+.001).map(r=>{
    const ancestors=ancestorNames(r),structure=ancestors.includes('Studio_Structure')||ancestors.includes('Studio_Roof');
    return {node:r.index,name:r.name,bounds:serializeBounds(r.bounds),classification:structure?'structure-or-roof-envelope':'review-required',explanation:structure?'Wall, roof, or dimension annotation can extend beyond the nominal interior floor. Exact extent remains listed.':'Nonstructural mesh exceeds nominal floor limits.'};
  });
  const embeddedImages=(g.images||[]).map((im,index)=>({index,name:im.name||null,mimeType:im.mimeType||null,storage:im.bufferView!==undefined?'GLB-bufferView':im.uri?.startsWith('data:')?'data-URI':'external',byteLength:im.bufferView!==undefined?views[im.bufferView].byteLength:null}));
  const collisionReview=footprintOverlaps.filter(o=>o.classification==='review-required'),hardFailures=[];
  if(official.issues.numErrors)hardFailures.push('Khronos validator errors');
  if(official.issues.truncated)hardFailures.push('Khronos validator report truncated');
  if(unsupported.length)hardFailures.push('Unsupported animated, skinned, or instanced geometry');
  if(groupChecks.some(c=>c.nodeCount!==1||!c.directChildOfRoot))hardFailures.push('Required root group missing, duplicated, or parented incorrectly');
  if(Object.values(unitChecks).some(v=>!v))hardFailures.push('Units, axis, dimensions, or no-people contract failed');
  if(inventoryIssues.length||countChecks.some(c=>!c.passed))hardFailures.push('Inventory node or count mismatch');
  if(footprintIssues.length)hardFailures.push('Invalid footprint metadata');
  if(footprintOutside.length)hardFailures.push('Floor occupancy outside nominal site');
  if(furnitureInCorridors.length)hardFailures.push('Declared floor occupancy in reserved corridors');
  if(collisionReview.length)hardFailures.push('Unexplained separate floor-footprint overlap');
  if(geometryOutside.some(o=>o.classification==='review-required'))hardFailures.push('Nonstructural geometry outside nominal site');
  const basis={file:path.basename(modelPath),sha256,bytes:bytes.length,checkedAt:new Date().toISOString(),coordinateSystem:'glTF Y-up, metres',scope:'Static photography studio concept, no people. Dimensions and equipment placement are design assumptions. No site measurement, electrical, fire, structural, photometric, or professional studio operating verification is performed.'};
  writeJSON('geometry-report.json',{...basis,gltfVersion:g.asset.version,nodeCount:nodes.length,activeNodeCount:active.length,uniqueMeshCount:meshes.length,meshInstances,primitiveInstances,triangleInstances,vertexInstances,materials:g.materials?.length||0,textures:g.textures?.length||0,embeddedImages,externalResources,extensionsUsed:g.extensionsUsed||[],extensionsRequired:g.extensionsRequired||[],unsupported,worldBounds:serializeBounds(sceneBounds),groupChecks,unitChecks,personNodes,geometryOutside,nodeBounds:activeRecords.map(r=>({node:r.index,name:r.name,parent:r.parent,worldPosition:r.worldPosition.map(round),worldBounds:serializeBounds(r.bounds)}))});
  writeJSON('inventory-validation.json',{...basis,inventoryCount:inventory.length,inventoryChecks,inventoryIssues,actualCounts,declaredCounts,countChecks,groupChecks,unitChecks,personNodes,passed:!inventoryIssues.length&&countChecks.every(c=>c.passed)&&Object.values(unitChecks).every(Boolean)&&groupChecks.every(c=>c.nodeCount===1&&c.directChildOfRoot)});
  writeJSON('layout-validation.json',{...basis,site:{width:extras.width,depth:extras.depth},footprintCount:footprints.length,floorFootprintCount:floorFootprints.length,excludedFootprints,corridorCount:corridors.length,method:{floorOccupancy:'Pairwise axis-aligned rectangles from root extras. Only explicitly declared ground footprints are checked. Same-assembly components and declared intentional overlaps are reported separately; supported props are excluded from ground occupancy.',geometry:'Reads actual binary POSITION accessors and node transforms independently of the renderer or model source. Does not use accessor min/max as a substitute for vertices.',people:'Not applicable; absence of people is checked by scene node names and root metadata.',limits:'Rectangles can overestimate tripod leg or curved object occupancy. Small props without footprints are not tested. Supports, intentional layering and raised components require visual review. Structural shell extents are reported separately from nominal interior dimensions.'},footprintIssues,footprintOutside,footprintOverlaps,furnitureInCorridors,footprintGeometryChecks,geometryOutside,collisionReview,hardFailures,passed:hardFailures.length===0});
  const infoCodes={};for(const issue of official.issues.messages||[])infoCodes[issue.code]=(infoCodes[issue.code]||0)+1;
  const summary={...basis,validatorVersion:validator.version(),gltfValidator:{errors:official.issues.numErrors,warnings:official.issues.numWarnings,infos:official.issues.numInfos,hints:official.issues.numHints,truncated:official.issues.truncated,issueCodes:infoCodes},geometry:{nodes:nodes.length,meshInstances,triangles:triangleInstances,embeddedImages:embeddedImages.length,externalResources:externalResources.length,worldBounds:serializeBounds(sceneBounds)},inventory:{itemCount:inventory.length,actualCounts,personNodes:personNodes.length},layout:{footprints:footprints.length,floorFootprints:floorFootprints.length,footprintsOutside:footprintOutside.length,corridorOccupancy:furnitureInCorridors.length,overlaps:footprintOverlaps.length,unexplainedOverlaps:collisionReview.length,geometryOutside:geometryOutside.length},hardFailures,passed:hardFailures.length===0};
  writeJSON('model-validation-summary.json',summary);console.log(JSON.stringify(summary,null,2));if(hardFailures.length)process.exitCode=1;
}
main().catch(error=>{console.error(error.stack||error.message);process.exitCode=1;});
