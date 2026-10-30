require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');
const {invokeDeepSeek}=require('../src/agentarts/deepseek');
test('DeepSeek request uses retrieved data and returns validated JSON text',async()=>{
 let body;const transport=async(url,options)=>{body=JSON.parse(options.body);return new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"summary":"计划","tasks":[]}'}}]}));};
 const config={url:'https://api.deepseek.com/v1/chat/completions',key:'test-key'};
 const result=await invokeDeepSeek({goal:'复习',dailyMinutes:60},{sources:[{id:'kg:1',title:'树',text:'遍历'}],tasks:[]},()=>{},config,transport);
 assert.equal(JSON.parse(result).summary,'计划');assert.ok(body.messages[1].content.includes('kg:1'));assert.ok(!body.messages[1].content.includes('toolToken'));assert.equal(body.response_format.type,'json_object');
});
test('DeepSeek fails closed without credentials and on errors or truncation',async()=>{
 await assert.rejects(()=>invokeDeepSeek({}, {},()=>{}, {url:'https://api.deepseek.com/v1/chat/completions',key:''}),/未配置/);
 for(const response of [new Response('',{status:401}),new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'partial'}}]}))]){
  await assert.rejects(()=>invokeDeepSeek({}, {},()=>{}, {url:'https://api.deepseek.com/v1/chat/completions',key:'test'},async()=>response));
 }
});
