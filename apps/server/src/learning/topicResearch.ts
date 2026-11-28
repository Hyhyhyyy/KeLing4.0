import type { PlanetResearch, PlanetSource } from '@keling/shared';

export type TopicResearchInput = { subject:string; level:string; goal:string; contextMode?:'auto'|'general'|'internet_culture' };
export type TopicSearchProvider = (query:string, signal:AbortSignal)=>Promise<unknown>;
let provider:TopicSearchProvider|undefined;
/** Registration is restricted to the trusted deployment adapter, never an HTTP input. */
export function registerTopicResearchProvider(value:TopicSearchProvider|undefined){provider=value;}
const clean=(value:unknown,max:number)=>typeof value==='string'?value.replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';

export function safeSourceUrl(value:unknown):string|undefined{
 if(typeof value!=='string'||value.length>2000)return;
 try{const url=new URL(value),host=url.hostname.toLowerCase();
  if(!['https:','http:'].includes(url.protocol)||url.username||url.password||!host.includes('.')||host==='localhost'||host.endsWith('.localhost')||host.endsWith('.local')||host.endsWith('.internal')||host.includes(':')||/^\d+(?:\.\d+)*$/.test(host))return;
  url.hash='';return url.href;
 }catch{return;}
}

/** Uses the official search response, not model-created citations or URLs. */
export function normalizeSearchResults(raw:unknown):Omit<PlanetSource,'id'>[]{
 if(!raw||typeof raw!=='object'||!('results'in raw)||!Array.isArray(raw.results))throw new Error('Search result contract invalid');
 return raw.results.slice(0,20).flatMap((item:unknown)=>{
  if(!item||typeof item!=='object')return [];
  const x=item as Record<string,unknown>,url=safeSourceUrl(x.url),title=clean(x.title,180),snippet=clean(x.summary,1800),publishedAt=clean(x.publish_time,80);
  if(!url||!title||snippet.length<20)return [];
  return [{title,url,snippet,...(publishedAt?{publishedAt}:{})}];
 });
}

export function topicQueries(input:TopicResearchInput):{intent:string;queries:string[]}{
 const subject=clean(input.subject,80),goal=clean(input.goal,180);
 const internet=input.contextMode==='internet_culture'||(input.contextMode!=='general'&&/网梗|流行语|二创|抽象文化|抽象梗|网络抽象|互联网抽象|网络文化|互联网文化|网络用语|整活|meme|梗学/i.test(subject+' '+goal));
 const intent=internet?'辨析网络流行语、社群用法与原作含义；区分可查事实、解释和争议，不把戏谑当学术定义。':input.contextMode==='general'?'依据标准概念和可靠资料解释主题，同时说明相邻概念与适用边界。':'先辨析主题的常见含义、专业用法与网络语境；不要未经辨析就把抽象主题当作唯一原作或正式学科。';
 const queries=internet?[`${subject} 网络流行语 梗 二创 含义 用法`,`${subject} 原作 二创 语境 出处 争议 误区 ${goal}`]:input.contextMode==='general'?[`${subject} 定义 原理 可靠资料 ${goal}`,`${subject} 概念辨析 事实 应用 适用条件 争议 常见误区`]:[`${subject} 含义 不同语境 用法 ${goal}`,`${subject} 网络讨论 概念辨析 事实 出处 争议 应用 误区`];
 return {intent,queries:queries.map(q=>q.slice(0,300))};
}

export async function researchTopic(input:TopicResearchInput,signal:AbortSignal=new AbortController().signal,search:TopicSearchProvider|undefined=provider):Promise<PlanetResearch>{
 const {intent,queries}=topicQueries(input),base={intent,queries,searchedAt:new Date().toISOString()};
 signal.throwIfAborted();
 if(!search)return {...base,status:'unavailable',sources:[]};
 const searchSignal=AbortSignal.any([signal,AbortSignal.timeout(40000)]);
 const results=await Promise.allSettled(queries.map(query=>new Promise<unknown>((resolve,reject)=>{
  const aborted=()=>reject(searchSignal.reason);searchSignal.addEventListener('abort',aborted,{once:true});
  if(searchSignal.aborted){aborted();return;}
  Promise.resolve().then(()=>search(query,searchSignal)).then(resolve,reject).finally(()=>searchSignal.removeEventListener('abort',aborted));
 })));
 signal.throwIfAborted();
 const urls=new Set<string>(),sources:PlanetSource[]=[],ranked:Omit<PlanetSource,'id'>[][]=[];let succeeded=0;
 for(const result of results){
  if(result.status!=='fulfilled')continue;
  try{const rows=normalizeSearchResults(result.value);succeeded++;ranked.push(rows);
  }catch{/* A malformed dependency response counts as failed, never as a successful search. */}
 }
 // Interleave ranks so a full first query cannot crowd out every result from the second intent.
 for(let rank=0;sources.length<10&&ranked.some(rows=>rank<rows.length);rank++){
  for(const rows of ranked){const row=rows[rank];if(!row||urls.has(row.url))continue;urls.add(row.url);sources.push({...row,id:`s${sources.length+1}`});if(sources.length===10)break;}
 }
 return {...base,status:sources.length>=2?'grounded':succeeded?'insufficient':'unavailable',sources};
}
