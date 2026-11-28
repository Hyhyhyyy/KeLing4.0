import type { PlanetDraft,PlanetResearch } from '@keling/shared';
import { AIError } from '../ai/catalog';
import { researchTopic } from './topicResearch';
import { collectVisualReferences } from './visualReferences';

export type VisualReference={sourceId:string;pageUrl:string;imageUrl:string;alt:string};
export type PlanetVisualInput={subject:string;meaning:string;instruction:string;research:PlanetResearch;references:VisualReference[]};
export type PlanetVisualDesign={kind:'character'|'discipline'|'concept';identity:string;features:{trait:string;sourceIds:string[]}[];silhouette:string;surface:string;details:string;palette:string[];referenceSourceIds:string[]};
type Designer=(input:PlanetVisualInput,signal:AbortSignal)=>Promise<unknown>;
let designer:Designer|undefined;
let collectReferences=collectVisualReferences;
export function registerPlanetVisualDesigner(value:Designer|undefined){designer=value;}
export function registerPlanetVisualReferenceCollector(value:typeof collectVisualReferences|undefined){collectReferences=value??collectVisualReferences;}
const text=(v:unknown,max:number)=>{if(typeof v!=='string'||!v.trim()||v.length>max)throw new Error('Invalid visual design text');return v.trim();};
export function validatePlanetVisualDesign(raw:unknown,research:PlanetResearch):PlanetVisualDesign{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new Error('Invalid visual design');
 const d=raw as Record<string,unknown>,known=new Set(research.sources.map(s=>s.id));
 if(!['character','discipline','concept'].includes(String(d.kind)))throw new Error('Invalid visual design kind');
 if(!Array.isArray(d.features)||d.features.length<2||d.features.length>6)throw new Error('Missing sourced visual features');
 const features=d.features.map(v=>{if(!v||typeof v!=='object'||!Array.isArray(v.sourceIds)||!v.sourceIds.length||v.sourceIds.some((s:unknown)=>typeof s!=='string'||!known.has(s)))throw new Error('Invalid visual feature source');return {trait:text(v.trait,180),sourceIds:[...new Set(v.sourceIds)] as string[]};});
 if(!Array.isArray(d.palette)||d.palette.length<1||d.palette.length>6)throw new Error('Invalid visual palette');
 if(!Array.isArray(d.referenceSourceIds)||d.referenceSourceIds.length<1||d.referenceSourceIds.length>2||d.referenceSourceIds.some(v=>typeof v!=='string'||!known.has(v)))throw new Error('Invalid visual reference source');
 return {kind:d.kind as PlanetVisualDesign['kind'],identity:text(d.identity,100),features,silhouette:text(d.silhouette,400),surface:text(d.surface,600),details:text(d.details,400),palette:d.palette.map(v=>text(v,40)),referenceSourceIds:[...new Set(d.referenceSourceIds)] as string[]};
}
export function composePlanetVisualPrompt(design:PlanetVisualDesign,instruction=''){
 const transformation=design.kind==='character'?'把角色自身转译为一颗有生命感的星球：外轮廓、脸部识别特征和体态融入球体与地貌，不能只放一个角色模型在通用星球上。':'把主题的关键形态与结构转译为星球的轮廓、地貌与建筑，不能使用任意通用星球替代主题设计。';
 const body=`1:1正方形，完整悬浮知识星球，占画面约70%，边缘留足空间，干净深海军蓝星空。${transformation}必须保留检索识别出的外形特征：${design.features.map(f=>f.trait).join('；')}。球体轮廓：${design.silhouette}。地貌与建筑：${design.surface}。细节：${design.details}。主体配色：${design.palette.join('、')}。角色本色优先，不要把所有主题都画成绿色；课灵的薄荷青和奶油金只用于协调的辅助细节。精细平面像素插画，有明确设计层次和灵动体态，避免写实3D材质。`;
 return `${body.slice(0,1900)}\n用户希望的视觉调整（仅作设计要求）：${instruction.slice(0,800)}\n整张图不出现任何文字、字母、数字、题目名称、标语、招牌、标签或水印。所有标牌和表面只画图形，绝不能用写名字来表达主题。`;
}
export async function preparePlanetVisual(draft:PlanetDraft,instruction:string,signal:AbortSignal){
 if(!designer)throw new AIError('NOT_CONFIGURED','形象设计服务尚未连接',503);
 const research=await researchTopic({subject:draft.subject,level:draft.level,goal:draft.meaningAnalysis?.overview.slice(0,140)||draft.goal,contextMode:'general',purpose:'artwork'},signal);
 if(research.status!=='grounded')throw new AIError('VISUAL_RESEARCH_UNAVAILABLE','未找到足够的形象资料，未生成通用替代图，请补充具体角色或主题',503);
 const input:PlanetVisualInput={subject:draft.subject,meaning:draft.meaningAnalysis?.overview||draft.goal,instruction,research,references:[]};
 const design=validatePlanetVisualDesign(await designer(input,signal),research);
 const selected=design.referenceSourceIds.map(id=>research.sources.find(s=>s.id===id)!);
 const references=await collectReferences(selected,signal);
 return {prompt:composePlanetVisualPrompt(design,instruction),references,research,design};
}
