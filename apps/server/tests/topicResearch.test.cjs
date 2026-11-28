const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module');
const file=require.resolve('../src/learning/topicResearch.ts'),mod=new Module(file,module);mod.filename=file;mod.paths=module.paths;
mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,file);
const {researchTopic,topicQueries,safeSourceUrl,normalizeSearchResults,registerTopicResearchProvider}=mod.exports;
const input={subject:'某个新词',level:'入门',goal:'了解用法',contextMode:'auto'};
const rows=[1,2].map(i=>({title:'来源'+i,url:`https://example.org/article/${i}`,summary:'这是来源中的实际摘要，用于验证引用保留，不代表任何真实知识。',publish_time:'2026-11-28'}));
test('only original search rows become stable source IDs; merge and deduplicate two queries',async()=>{
 const queries=[];const result=await researchTopic(input,undefined,async q=>{queries.push(q);return {results:rows};});
 assert.equal(queries.length,2);assert.equal(result.status,'grounded');assert.deepEqual(result.sources.map(x=>x.id),['s1','s2']);assert.equal(result.sources[0].snippet,rows[0].summary);assert.equal(result.sources[0].url,rows[0].url);assert.equal(result.sources[0].publishedAt,'2026-11-28');
});
test('unconfigured, failed, malformed, empty and insufficient searches remain distinct',async()=>{
 registerTopicResearchProvider(undefined);assert.equal((await researchTopic(input)).status,'unavailable');
 for(const f of [async()=>{throw new Error('secret dependency detail');},async()=>({summary:'Model prose is not a source list'})])assert.equal((await researchTopic(input,undefined,f)).status,'unavailable');
 assert.equal((await researchTopic(input,undefined,async()=>({results:[]}))).status,'insufficient');
 assert.equal((await researchTopic(input,undefined,async()=>({results:[rows[0]]}))).status,'insufficient');
});
test('rank interleaving considers both query intents, deduplicates overlaps and fills from the available query',async()=>{
 const make=(label,count)=>Array.from({length:count},(_,i)=>({...rows[0],title:label+i,url:`https://example.org/${label}/${i}`}));
 let call=0;const mixed=await researchTopic(input,undefined,async()=>({results:make(call++===0?'meaning':'context',10)}));
 assert.deepEqual(mixed.sources.map(s=>new URL(s.url).pathname),Array.from({length:5},(_,i)=>[`/meaning/${i}`,`/context/${i}`]).flat());
 assert.deepEqual(mixed.sources.map(s=>s.id),Array.from({length:10},(_,i)=>'s'+(i+1)));
 call=0;const overlap=await researchTopic(input,undefined,async()=>({results:call++===0?make('shared',8):[...make('shared',3),...make('context',8)]}));
 assert.equal(overlap.sources.length,10);assert.equal(new Set(overlap.sources.map(s=>s.url)).size,10);assert.ok(overlap.sources.some(s=>s.url.includes('/context/')));
 for(const missing of ['empty','failed']){call=0;const filled=await researchTopic(input,undefined,async()=>{if(call++===0){if(missing==='failed')throw new Error('test search failure');return {results:[]};}return {results:make('available',12)};});assert.equal(filled.status,'grounded');assert.equal(filled.sources.length,10);}
});
test('source URLs exclude executable schemes, credentials, localhost and literal IP addresses',()=>{
 for(const url of ['javascript:alert(1)','file:///etc/passwd','https://user:pass@example.com/a','http://127.0.0.1/a','http://2130706433/a','https://[::1]/','http://localhost','http://a.internal/','https://a.local/'])assert.equal(safeSourceUrl(url),undefined,url);
 assert.equal(safeSourceUrl('https://example.org/a#top'),'https://example.org/a');
 assert.equal(normalizeSearchResults({results:[...rows,{title:'empty',url:'https://example.org/b',summary:''},{title:'private',url:'http://127.0.0.1/a',summary:'x'.repeat(50)}]}).length,2);
});
test('topic analysis is general, preserves an abstract term and respects explicit context',()=>{
 assert.ok(topicQueries({...input,subject:'奶龙学'}).queries.every(q=>q.includes('奶龙学')));
 assert.ok(topicQueries({...input,subject:'苹果',contextMode:'internet_culture'}).queries[0].includes('网络流行语'));
 assert.ok(topicQueries({...input,subject:'经济学',contextMode:'general'}).queries[0].includes('可靠资料'));
 assert.ok(!topicQueries({...input,subject:'经济学',contextMode:'general'}).queries[0].includes('流行语'));
 for(const subject of ['抽象代数','抽象概念','计算机网络'])assert.ok(!topicQueries({...input,subject}).queries[0].includes('网络流行语'),subject);
 assert.ok(topicQueries({...input,subject:'抽象文化'}).queries[0].includes('网络流行语'));
});
test('caller cancellation stops uncooperative search without generating fake fallback sources',async()=>{
 const c=new AbortController();const work=researchTopic(input,c.signal,async()=>new Promise(()=>{}));c.abort();await assert.rejects(work);
});
