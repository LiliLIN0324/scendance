#!/usr/bin/env node
// node validation/validate-glb.mjs [conference.glb] [gltf-validator package path]
// The portable preview has no Node dependency. This optional authoring check
// reuses the workspace validator or GLTF_VALIDATOR_MODULE without installing it.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import crypto from 'node:crypto';
const here=path.dirname(fileURLToPath(import.meta.url));
const file=path.resolve(process.argv[2]||path.join(here,'../conference.glb'));
const require=createRequire(import.meta.url);
const candidate=process.argv[3]||process.env.GLTF_VALIDATOR_MODULE||path.resolve(here,'../../../scendance-frontend/node_modules/gltf-validator');
let validator;try{validator=require(candidate);}catch{try{validator=require('gltf-validator');}catch{throw new Error('Existing gltf-validator module not found. Supply its directory as the second argument or GLTF_VALIDATOR_MODULE. No package installation is needed by the preview.');}}
const bytes=await fs.readFile(file);
if(bytes.toString('ascii',0,4)!=='glTF'||bytes.readUInt32LE(4)!==2||bytes.readUInt32LE(8)!==bytes.length)throw new Error('Invalid GLB 2 header');
const chunks=[];let doc;
for(let offset=12;offset<bytes.length;){const length=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);if(offset+8+length>bytes.length)throw new Error('Truncated GLB');chunks.push({type:type===0x4e4f534a?'JSON':type===0x004e4942?'BIN':type,bytes:length});if(type===0x4e4f534a)doc=JSON.parse(bytes.toString('utf8',offset+8,offset+8+length));offset+=8+length;}
if(!doc)throw new Error('Missing GLB JSON');
const externalResources=[];
for(const kind of ['buffers','images'])for(const [index,r]of(doc[kind]||[]).entries())if(r.uri&&!r.uri.startsWith('data:'))externalResources.push({kind,index,uri:r.uri});
const imageChecks=(doc.images||[]).map((im,index)=>({index,name:im.name||'',mimeType:im.mimeType||null,embedded:im.bufferView!==undefined||Boolean(im.uri?.startsWith('data:')),bytes:im.bufferView!==undefined?doc.bufferViews[im.bufferView].byteLength:null}));
const official=await validator.validateBytes(new Uint8Array(bytes),{uri:path.basename(file),format:'glb',maxIssues:0,externalResourceFunction:async uri=>{throw new Error(`Unexpected external resource ${uri}`);}});
await fs.writeFile(path.join(here,'gltf-validation.json'),JSON.stringify(official,null,2)+'\n');
const expected=['Conference_24x18','Conference_Seating','GuestSeating','People','Guests','Staff','Roof','Structure','Furniture','Lights'];
const groups=expected.map(name=>{const n=(doc.nodes||[]).find(n=>n.name===name||n.name===`Conference_${name}`);return{name,present:Boolean(n),childCount:n?.children?.length||0};});
const root=doc.nodes.find(n=>n.name==='Conference_24x18');
const checks={version2:doc.asset.version==='2.0',singleDefaultScene:(doc.scenes||[]).length===1,requiredGroups:groups.every(g=>g.present),noValidatorErrors:official.issues.numErrors===0,noValidatorWarnings:official.issues.numWarnings===0,validatorNotTruncated:!official.issues.truncated,noExternalResources:externalResources.length===0,allImagesEmbedded:imageChecks.every(i=>i.embedded),hasEmbeddedArtwork:imageChecks.length>0,conceptDimensions:root?.extras?.width===24&&root?.extras?.depth===18};
const summary={checkedAt:new Date().toISOString(),file:path.basename(file),bytes:bytes.length,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),gltfVersion:doc.asset.version,generator:doc.asset.generator,chunks,nodeCount:doc.nodes?.length||0,meshCount:doc.meshes?.length||0,materials:doc.materials?.length||0,textures:doc.textures?.length||0,images:imageChecks.length,embeddedImages:imageChecks.filter(i=>i.embedded).length,imageChecks,externalResources,extensionsUsed:doc.extensionsUsed||[],extensionsRequired:doc.extensionsRequired||[],groups,rootMetadata:root?.extras||{},validator:{version:validator.version(),errors:official.issues.numErrors,warnings:official.issues.numWarnings,infos:official.issues.numInfos,hints:official.issues.numHints,truncated:official.issues.truncated},checks,passed:Object.values(checks).every(Boolean),limitations:['Validates the standalone default GLB snapshot; UI changes are checked separately by check-layout.mjs and browser validation.','Format validation and authored concept dimensions do not certify a real venue or its capacity.']};
await fs.writeFile(path.join(here,'model-validation.json'),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({file:summary.file,bytes:summary.bytes,sha256:summary.sha256,embeddedImages:summary.embeddedImages,externalResources:externalResources.length,validator:summary.validator,checks,passed:summary.passed},null,2));
if(!summary.passed)process.exitCode=1;
