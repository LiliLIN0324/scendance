import { Document, WebIO, type vec3 } from '@gltf-transform/core';
import type { Backend } from './backend.ts';
import { assetRecord } from './assets.ts';
import { ApiError, canonical, sha256, uuid } from './domain.ts';
import { validateModel } from './models.ts';
import { PARAMETRIC_BUILDER_VERSION, parametricNames, parametricParametersSchema } from './parametric-contract.ts';
import type { SceneResource } from './scene-resources.ts';

/** Metres, Y up, centred X/Z footprint, ground at Y=0. Only these fixed builders run. */
export async function buildParametricGlb(input:unknown) {
  const parameters=parametricParametersSchema.parse(input),p=parameters;
  const doc=new Document(),buffer=doc.createBuffer(),scene=doc.createScene('Parametric model');
  const linear=(value:number)=>value<=0.04045?value/12.92:Math.pow((value+0.055)/1.055,2.4);
  const rgb=[1,3,5].map(offset=>linear(parseInt(p.color.slice(offset,offset+2),16)/255));
  const material=doc.createMaterial('surface').setBaseColorFactor([rgb[0],rgb[1],rgb[2],1]).setMetallicFactor(0).setRoughnessFactor(0.7);
  function mesh(name:string,positions:number[],normals:number[],uv:number[],indices:number[],translation:vec3) {
    const primitive=doc.createPrimitive().setMaterial(material)
      .setAttribute('POSITION',doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
      .setAttribute('NORMAL',doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer))
      .setAttribute('TEXCOORD_0',doc.createAccessor().setType('VEC2').setArray(new Float32Array(uv)).setBuffer(buffer))
      .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer));
    scene.addChild(doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(primitive)).setTranslation(translation));
  }
  function box(name:string,w:number,h:number,d:number,x=0,y=h/2,z=0) {
    const positions:number[]=[],normals:number[]=[],uv:number[]=[],indices:number[]=[];
    const faces=[
      {n:[1,0,0],v:[[1,-1,-1],[1,1,-1],[1,1,1],[1,-1,1]]},
      {n:[-1,0,0],v:[[-1,-1,1],[-1,1,1],[-1,1,-1],[-1,-1,-1]]},
      {n:[0,1,0],v:[[-1,1,-1],[-1,1,1],[1,1,1],[1,1,-1]]},
      {n:[0,-1,0],v:[[-1,-1,1],[-1,-1,-1],[1,-1,-1],[1,-1,1]]},
      {n:[0,0,1],v:[[1,-1,1],[1,1,1],[-1,1,1],[-1,-1,1]]},
      {n:[0,0,-1],v:[[-1,-1,-1],[-1,1,-1],[1,1,-1],[1,-1,-1]]},
    ];
    for(const face of faces) {
      const base=positions.length/3;
      for(const v of face.v){positions.push(v[0]*w/2,v[1]*h/2,v[2]*d/2);normals.push(...face.n);}
      uv.push(0,0,0,1,1,1,1,0);indices.push(base,base+1,base+2,base,base+2,base+3);
    }
    mesh(name,positions,normals,uv,indices,[x,y,z]);
  }
  function cylinder(name:string,diameter:number,height:number,y:number) {
    const positions:number[]=[],normals:number[]=[],uv:number[]=[],indices:number[]=[],segments=32,r=diameter/2;
    for(let i=0;i<=segments;i++) {
      const angle=i*Math.PI*2/segments,x=Math.cos(angle),z=Math.sin(angle);
      positions.push(x*r,-height/2,z*r,x*r,height/2,z*r);normals.push(x,0,z,x,0,z);uv.push(i/segments,0,i/segments,1);
      if(i<segments){const a=i*2;indices.push(a,a+1,a+3,a,a+3,a+2);}
    }
    for(const sign of [-1,1]) {
      const center=positions.length/3;positions.push(0,sign*height/2,0);normals.push(0,sign,0);uv.push(0.5,0.5);
      for(let i=0;i<=segments;i++) {
        const angle=i*Math.PI*2/segments,x=Math.cos(angle),z=Math.sin(angle);
        positions.push(x*r,sign*height/2,z*r);normals.push(0,sign,0);uv.push((x+1)/2,(z+1)/2);
        if(i<segments)indices.push(center,center+i+(sign===1?2:1),center+i+(sign===1?1:2));
      }
    }
    mesh(name,positions,normals,uv,indices,[0,y,0]);
  }
  function legs(width:number,depth:number,height:number,thickness:number) {
    for(const x of [-1,1])for(const z of [-1,1])box('leg',thickness,height,thickness,x*(width-thickness)/2,height/2,z*(depth-thickness)/2);
  }
  if(p.family==='table') {
    const legHeight=p.height-p.topThickness;
    if(p.variant==='round')cylinder('top',p.width,p.topThickness,p.height-p.topThickness/2);
    else box('top',p.width,p.topThickness,p.depth,0,p.height-p.topThickness/2);
    if(p.legs==='pedestal')cylinder('pedestal',p.legThickness,legHeight,legHeight/2);
    else {const footprint=p.variant==='round'?Math.min(p.width/Math.SQRT2,p.width-p.legThickness):p.width;legs(footprint,p.variant==='round'?footprint:p.depth,legHeight,p.legThickness);}
  } else if(p.family==='chair') {
    const seat=p.variant==='stool'?p.height:p.seatHeight;
    box('seat',p.width,p.seatThickness,p.depth,0,seat-p.seatThickness/2);legs(p.width,p.depth,seat-p.seatThickness,p.legThickness);
    if(p.variant==='backed')box('back',p.width,p.height-seat,p.backThickness,0,(p.height+seat)/2,-(p.depth-p.backThickness)/2);
  } else if(p.family==='counter') {
    const h=p.height-p.topThickness,t=p.panelThickness;
    if(p.variant==='straight') {
      box('top',p.width,p.topThickness,p.depth,0,p.height-p.topThickness/2);
      box('front',p.width,h,t,0,h/2,-(p.depth-t)/2);
      for(const x of [-1,1])box('side',t,h,p.depth,x*(p.width-t)/2);
    } else {
      box('top-main',p.width,p.topThickness,p.armDepth,0,p.height-p.topThickness/2,-(p.depth-p.armDepth)/2);
      box('top-return',p.armDepth,p.topThickness,p.depth-p.armDepth,-(p.width-p.armDepth)/2,p.height-p.topThickness/2,p.armDepth/2);
      box('front',p.width,h,t,0,h/2,-(p.depth-t)/2);
      box('return-side',t,h,p.depth,-(p.width-t)/2);
      box('main-end',t,h,p.armDepth,(p.width-t)/2,h/2,-(p.depth-p.armDepth)/2);
      box('return-end',p.armDepth,h,t,-(p.width-p.armDepth)/2,h/2,(p.depth-t)/2);
    }
  } else if(p.family==='platform')box('platform',p.width,p.height,p.depth);
  else if(p.family==='backdrop') {
    box('base',p.width,p.baseHeight,p.depth);
    box('panel',p.width,p.height-p.baseHeight,p.panelThickness,0,(p.height+p.baseHeight)/2);
  } else if(p.family==='cabinet') {
    const t=p.panelThickness;
    for(const x of [-1,1])box('side',t,p.height,p.depth,x*(p.width-t)/2);
    for(const y of [t/2,p.height-t/2])box('horizontal',p.width-2*t,t,p.depth,0,y);
    box('back',p.width-2*t,p.height-2*t,t,0,p.height/2,-(p.depth-t)/2);
    for(let i=1;i<=p.shelves;i++)box('shelf',p.width-2*t,t,p.depth-t,0,t+(p.height-2*t)*i/(p.shelves+1),t/2);
    if(p.variant==='closed')box('door',p.width-2*t,p.height-2*t,t,0,p.height/2,(p.depth-t)/2);
  }
  const bytes=await new WebIO().writeBinary(doc),validated=await validateModel(bytes);
  const size={width:p.width,depth:p.depth,height:p.height};
  if((Object.keys(size) as (keyof typeof size)[]).some(key=>Math.abs(validated.sourceSize[key]-size[key])>0.00001))throw new ApiError('PARAMETRIC_BOUNDS_MISMATCH',500);
  const metadata={...validated,parametric:{builderVersion:PARAMETRIC_BUILDER_VERSION,family:p.family,parameters,size,procurementStatus:'needs_confirmation'}};
  return {bytes,metadata,size,parameters};
}

export async function createParametricAsset(backend:Backend,actor:string,studioId:string,requestId:string,input:unknown) {
  uuid.parse(actor);uuid.parse(studioId);uuid.parse(requestId);
  const parameters=parametricParametersSchema.parse(input);
  const fingerprint=await sha256(canonical({studioId,builderVersion:PARAMETRIC_BUILDER_VERSION,parameters}));
  const data={studioId,requestId,fingerprint,parameters,builderVersion:PARAMETRIC_BUILDER_VERSION};
  const reservation=await backend.scene(actor,'parametric.reserve',data);
  let result=reservation;
  if(!reservation.asset) {
    const built=await buildParametricGlb(parameters);
    const asset=await assetRecord(actor,built.bytes,{name:`${parametricNames[parameters.family]} · 参数模型`,source:'parametric',sourceId:`${PARAMETRIC_BUILDER_VERSION}:${parameters.family}`,license:{id:'Scendance-parametric',notice:'参数化构型；采购与施工规格待确认'},metadata:built.metadata},reservation.assetId);
    await backend.upload(asset.storagePath,built.bytes,'model/gltf-binary');
    result=await backend.scene(actor,'parametric.complete',{...data,asset});
  }
  const asset=result.asset;
  const resource:SceneResource={resourceId:`asset:${asset.id}`,assetId:asset.id,name:asset.name,category:'parametric',size:{width:parameters.width,depth:parameters.depth,height:parameters.height}};
  return {asset,reused:!!result.reused,resource};
}
