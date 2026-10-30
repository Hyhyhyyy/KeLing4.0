export interface RunEvent { name:string; type:string; status:string; at:string }
export async function readRuntimeStream(body: ReadableStream<Uint8Array>, onEvent:(e:RunEvent)=>void): Promise<string> {
  const reader=body.getReader(); const decoder=new TextDecoder(); let buffer='', result='', ended=false, bytes=0;
  const consume=(block:string)=>{
    const data=block.split(/\r?\n/).filter(s=>s.startsWith('data:')).map(s=>s.slice(5).trimStart()).join('\n');
    if(!data || data==='[DONE]') return;
    const e=JSON.parse(data); const d=e.data||{};
    if(e.event==='error'||e.event==='exception'||(e.event==='workflow_finished' && d.status?.desc==='failed')) throw new Error('AgentArts 执行失败，请检查云端运行日志');
    if(['node_started','node_finished','plugin_start','plugin_end','workflow_started','workflow_finished','start','end','node_wait'].includes(e.event)) {
      onEvent({name:String(d.node_name||e.plugin?.name||e.event).slice(0,120),type:String(d.node_type||e.type||'runtime').slice(0,60),status:e.event,at:new Date().toISOString()});
    }
    if(e.event==='node_wait') throw new Error('云端工作流等待输入，请完善目标后重新运行');
    if(e.event==='summary_response' && typeof e.content==='string') result=e.content;
    if(e.event==='workflow_finished' && d.outputs) {
      const value=d.outputs.plan ?? d.outputs.responseContent ?? d.outputs.user_fields?.plan;
      if(value) result=typeof value==='string'?value:JSON.stringify(value);
    }
    if(e.event==='end') ended=true;
  };
  try {
    while(true){const {done,value}=await reader.read(); if(done)break; bytes+=value.byteLength;if(bytes>2_000_000)throw new Error('AgentArts 响应过大'); buffer+=decoder.decode(value,{stream:true}); const blocks=buffer.split(/\r?\n\r?\n/); buffer=blocks.pop()||''; for(const block of blocks)consume(block);}
    buffer+=decoder.decode(); if(buffer.trim())consume(buffer);
    if(!ended||!result) throw new Error('AgentArts 响应不完整或缺少最终结构化计划');
    return result;
  } finally { await reader.cancel().catch(()=>{}); reader.releaseLock(); }
}
export function runtimeConfigured(): boolean { return Boolean(process.env.AGENTARTS_RUNTIME_URL && process.env.AGENTARTS_API_KEY && process.env.AGENTARTS_TOOL_SECRET); }
export async function invokeRuntime(input: unknown, sessionId:string, onEvent:(e:RunEvent)=>void, transport:typeof fetch=fetch):Promise<string>{
  if(!runtimeConfigured())throw new Error('尚未配置 AgentArts Runtime、API Key 和工具密钥');
  const url=new URL(process.env.AGENTARTS_RUNTIME_URL!);if(url.protocol!=='https:')throw new Error('AgentArts Runtime 必须使用 HTTPS');
  const kind=process.env.AGENTARTS_RUNTIME_KIND||'workflow';
  if(!['workflow','agent'].includes(kind))throw new Error('AgentArts Runtime 类型必须为 workflow 或 agent');
  const body=kind==='agent'?{query:JSON.stringify(input),inputs:input}:{inputs:input};
  const response=await transport(url,{method:'POST',signal:AbortSignal.timeout(90_000),headers:{'Content-Type':'application/json','Authorization':`Bearer ${process.env.AGENTARTS_API_KEY}`,'x-hw-agentarts-session-id':sessionId,'X-Request-Id':sessionId,'X-Invoke-Mode':process.env.AGENTARTS_INVOKE_MODE==='debug'?'debug':'published'},body:JSON.stringify(body)});
  if(!response.ok || !response.body)throw new Error(`AgentArts HTTP ${response.status}`);
  return readRuntimeStream(response.body,onEvent);
}
