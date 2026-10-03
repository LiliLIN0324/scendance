import { z } from 'zod';
import { colorSchema, uuid } from './domain.ts';

export const PARAMETRIC_BUILDER_VERSION='1';
const dimensions={width:z.number().min(0.1).max(50),depth:z.number().min(0.1).max(50),height:z.number().min(0.05).max(30),color:colorSchema.default('#cbb68e')};
const thickness=z.number().min(0.01).max(0.5);
export const parametricParametersSchema=z.discriminatedUnion('family',[
  z.strictObject({family:z.literal('table'),...dimensions,variant:z.enum(['rectangle','round']).default('rectangle'),topThickness:thickness.default(0.04),legs:z.enum(['four','pedestal']).default('four'),legThickness:thickness.default(0.05)}),
  z.strictObject({family:z.literal('chair'),...dimensions,variant:z.enum(['backed','stool']).default('backed'),seatHeight:z.number().min(0.1).max(2).default(0.45),seatThickness:thickness.default(0.04),legThickness:thickness.default(0.04),backThickness:thickness.default(0.04)}),
  z.strictObject({family:z.literal('counter'),...dimensions,variant:z.enum(['straight','l']).default('straight'),topThickness:thickness.default(0.04),panelThickness:thickness.default(0.03),armDepth:z.number().min(0.1).max(5).default(0.5)}),
  z.strictObject({family:z.literal('platform'),...dimensions}),
  z.strictObject({family:z.literal('backdrop'),...dimensions,panelThickness:thickness.default(0.04),baseHeight:thickness.default(0.05)}),
  z.strictObject({family:z.literal('cabinet'),...dimensions,variant:z.enum(['open','closed']).default('open'),panelThickness:thickness.default(0.02),shelves:z.number().int().min(0).max(8).default(2)}),
]).superRefine((p,ctx)=>{
  const reject=(message:string)=>ctx.addIssue({code:'custom',message});
  if(p.family==='table') {
    if(p.topThickness>=p.height || p.legThickness*2>=Math.min(p.width,p.depth))reject('桌面厚度和桌腿必须小于桌体尺寸');
    if(p.variant==='round' && p.width!==p.depth)reject('圆桌的宽度和深度必须相同');
  } else if(p.family==='chair') {
    const seat=p.variant==='stool'?p.height:p.seatHeight;
    if(p.seatThickness>=seat || p.legThickness*2>=Math.min(p.width,p.depth) || p.backThickness>=p.depth)reject('坐面、椅腿和靠背厚度必须小于椅体尺寸');
    if(p.variant==='backed' && p.seatHeight>=p.height)reject('靠背椅的总高度必须高于坐面');
  } else if(p.family==='counter') {
    if(p.topThickness>=p.height || p.panelThickness*2>=Math.min(p.width,p.depth))reject('台面和侧板厚度必须小于柜台尺寸');
    if(p.variant==='l' && (p.armDepth>=Math.min(p.width,p.depth) || p.armDepth<=p.panelThickness*2))reject('L 形柜台臂宽必须大于侧板且小于整体宽深');
  } else if(p.family==='backdrop') {
    if(p.panelThickness>=p.depth || p.baseHeight>=p.height)reject('背景板底座须比板体深且低于整体高度');
  } else if(p.family==='cabinet') {
    if(p.panelThickness*2>=Math.min(p.width,p.depth) || p.panelThickness*(p.shelves+2)>=p.height)reject('柜板与层板厚度超过柜体可用空间');
  }
});
export type ParametricParameters=z.infer<typeof parametricParametersSchema>;
export const parametricAssetRequestSchema=z.strictObject({requestId:uuid,studioId:uuid,parameters:parametricParametersSchema});
export const parametricNames:Record<ParametricParameters['family'],string>={table:'桌子',chair:'椅凳',counter:'柜台',platform:'台座',backdrop:'背景板',cabinet:'收纳柜'};
