import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { request } from 'node:https';

export type VisualReference = {sourceId:string;pageUrl:string;imageUrl:string;alt:string};
type SourcePage = {id:string;url:string;title:string};
type Fetched = {url:string;contentType:string;body:Buffer};
type FetchPublic = (url:string,kind:'page'|'image',signal:AbortSignal)=>Promise<Fetched>;
class ReferenceHttpError extends Error {constructor(readonly status:number){super('Unexpected visual reference HTTP status');}}

/** Conservative public-address allowlist. In particular IPv4-mapped IPv6 is not accepted. */
export function isPublicAddress(address:string):boolean {
 if(isIP(address)===4){
  const [a,b,c]=address.split('.').map(Number);
  return a!==0&&a!==10&&a!==127&&a<224&&!(a===100&&b>=64&&b<=127)&&!(a===169&&b===254)
   &&!(a===172&&b>=16&&b<=31)&&!(a===192&&(b===168||b===0||b===2))
   &&!(a===198&&(b===18||b===19||(b===51&&c===100)))&&!(a===203&&b===0&&c===113);
 }
 if(isIP(address)!==6)return false;
 const lower=address.toLowerCase();
 // Public global unicast only; exclude documentation, transition and special-purpose ranges.
 return /^[23][0-9a-f]{3}:/.test(lower)&&!lower.startsWith('2001:')&&!lower.startsWith('2002:')
  &&!lower.startsWith('3fff:')&&!lower.includes('.')&&!lower.includes('%');
}

function publicUrl(raw:string):URL {
 const u=new URL(raw),host=u.hostname.toLowerCase();
 if(raw.length>2000||u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'
  ||isIP(host.replace(/^\[|\]$/g,''))||!host.includes('.')||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(host))throw new Error('Unsafe visual reference URL');
 u.hash='';return u;
}

/** DNS is checked before every redirect and the chosen address is pinned into the TLS connection. */
export const fetchPublicReference:FetchPublic=async(raw,kind,signal)=>{
 let u=publicUrl(raw);const limit=kind==='page'?512*1024:4*1024*1024;
 for(let redirect=0;redirect<=3;redirect++){
  signal.throwIfAborted();
  let abortDns:()=>void=()=>{};
  const records=await Promise.race([
   lookup(u.hostname,{all:true,verbatim:true}),
   new Promise<never>((_,reject)=>{abortDns=()=>reject(new Error('Reference fetch aborted'));if(signal.aborted)abortDns();else signal.addEventListener('abort',abortDns,{once:true});}),
  ]).finally(()=>signal.removeEventListener('abort',abortDns));
  if(!records.length||records.some(r=>!isPublicAddress(r.address)))throw new Error('Reference host is not public');
  const pinned=records[0];
  const response=await new Promise<{status:number;location:string;type:string;body:Buffer}>((resolve,reject)=>{
   const req=request(u,{method:'GET',agent:false,signal,family:pinned.family,headers:{'User-Agent':'KeLing-VisualReference/1.0','Accept':kind==='page'?'text/html':'image/png,image/jpeg,image/webp','Accept-Encoding':'identity'},
    lookup:(_host,_options,callback)=>callback(null,pinned.address,pinned.family),
   },res=>{
    const status=res.statusCode??0,location=String(res.headers.location??''),type=String(res.headers['content-type']??'').split(';')[0].trim().toLowerCase();
    if([301,302,303,307,308].includes(status)){res.destroy();resolve({status,location,type,body:Buffer.alloc(0)});return;}
    if(status!==200){res.destroy();reject(new ReferenceHttpError(status));return;}
    if(res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'
     ||Number(res.headers['content-length'])>limit||!(kind==='page'?['text/html','application/xhtml+xml'].includes(type):['image/png','image/jpeg','image/webp'].includes(type))){res.destroy();reject(new Error('Unexpected visual reference response'));return;}
    let bytes=0;const chunks:Buffer[]=[];
    res.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>limit){res.destroy();reject(new Error('Visual reference too large'));}else chunks.push(chunk);});
    res.on('end',()=>resolve({status,location,type,body:Buffer.concat(chunks)}));res.on('error',reject);
   });
   req.setTimeout(8000,()=>req.destroy(new Error('Visual reference timeout')));req.on('error',reject);req.end();
  });
  if([301,302,303,307,308].includes(response.status)){if(redirect===3||!response.location)throw new Error('Visual reference redirect limit');u=publicUrl(new URL(response.location,u).href);continue;}
  if(kind==='image'){
   const b=response.body,valid=response.type==='image/png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))
    :response.type==='image/jpeg'?b[0]===255&&b[1]===216&&b[2]===255
    :b.subarray(0,4).toString()==='RIFF'&&b.subarray(8,12).toString()==='WEBP';
   if(!valid||b.length<64)throw new Error('Invalid visual reference image');
   // Exclude tiny interface badges and wide text-strip PNGs before using them as appearance references.
   if(response.type==='image/png'){
    if(b.length<24)throw new Error('Invalid visual reference image');
    const width=b.readUInt32BE(16),height=b.readUInt32BE(20);
    if(width<96||height<96||width/height>4||height/width>4)throw new Error('Decorative visual reference image');
   }
  }
  return {url:u.href,contentType:response.type,body:response.body};
 }
 throw new Error('Visual reference unavailable');
};

function decodeAttribute(value:string){return value.replace(/&(?:amp|quot|apos|lt|gt|#\d+|#x[0-9a-f]+);/gi,entity=>{
 const name=entity.slice(1,-1).toLowerCase(),named:Record<string,string>={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'};
 if(named[name])return named[name];const n=name.startsWith('#x')?parseInt(name.slice(2),16):parseInt(name.slice(1),10);return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';
});}

/** Only URLs literally present in real HTML are candidates; this does not parse model output. */
export function extractImageCandidates(html:string,pageUrl:string):{url:string;alt:string}[]{
 const candidates:{url:string;alt:string;priority:number}[]=[];
 for(const tag of html.match(/<(?:meta|img)\b[^>]*>/gi)??[]){
  const attrs:Record<string,string>={};
  for(const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g))attrs[m[1].toLowerCase()]=decodeAttribute(m[2]??m[3]??m[4]??'');
  const isMeta=/^<meta/i.test(tag),label=(attrs.property??attrs.name??'').toLowerCase();
  const raw=isMeta&&['og:image','og:image:url','twitter:image','twitter:image:src'].includes(label)?attrs.content:!isMeta?attrs.src??attrs['data-src']:undefined;
  if(!raw||/(?:favicon|(?:^|[\/_-])(?:logo|button|arrow|icon|title)(?:[.\/_-]|$)|tracking|pixel\.gif|slogan)/i.test(raw)
   ||/(?:logo|slogan|title|arrow|button|qrcode)/i.test([attrs.class,attrs.id,attrs.alt].filter(Boolean).join(' ')))continue;
  try{const u=publicUrl(new URL(raw,pageUrl).href);candidates.push({url:u.href,alt:(attrs.alt??'').slice(0,300),priority:isMeta?0:1});}catch{/* Invalid external candidates are ignored. */}
 }
 const seen=new Set<string>();return candidates.sort((a,b)=>a.priority-b.priority).filter(x=>!seen.has(x.url)&&!!seen.add(x.url)).slice(0,6).map(({url,alt})=>({url,alt}));
}

export async function collectVisualReferences(sources:readonly SourcePage[],signal:AbortSignal,fetcher:FetchPublic=fetchPublicReference):Promise<VisualReference[]>{
 const timeout=AbortSignal.timeout(20000),bounded=AbortSignal.any([signal,timeout]);const results:VisualReference[]=[],seen=new Set<string>();let pageRequests=0;
 for(const source of sources.slice(0,2)){
  if(bounded.aborted||pageRequests>=2)break;
  try{
   let page:Fetched;
   try{pageRequests++;page=await fetcher(source.url,'page',bounded);}catch(error){
    const status=error&&typeof error==='object'&&'status'in error?error.status:undefined;
    const original=publicUrl(source.url);
    if(![404,410].includes(Number(status))||pageRequests>=2||original.pathname==='/')throw error;
    // The standard same-origin home entry is fetched as a new real page, never guessed article paths.
    pageRequests++;page=await fetcher(new URL('/',original).href,'page',bounded);
   }
   const candidates=extractImageCandidates(page.body.toString('utf8'),page.url);
   for(const candidate of candidates.slice(0,4)){
    if(results.length>=2||bounded.aborted)break;if(seen.has(candidate.url))continue;seen.add(candidate.url);
    try{const image=await fetcher(candidate.url,'image',bounded);results.push({sourceId:source.id,pageUrl:page.url,imageUrl:image.url,alt:candidate.alt});}catch{/* Unavailable or unsafe images never become model inputs. */}
   }
  }catch{/* Missing public references keep the caller on an explicit no-reference path. */}
  if(results.length>=2)break;
 }
 signal.throwIfAborted();return results;
}
