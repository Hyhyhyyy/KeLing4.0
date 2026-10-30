require('ts-node/register');
const {test}=require('node:test');const assert=require('node:assert/strict');const express=require('express');const jwt=require('jsonwebtoken');const {PrismaClient}=require('@prisma/client');const {agentRouter}=require('../src/agentarts/routes');
test('HTTP rejects unauthenticated, unconfigured, cross-user and unauthorized tool requests',async()=>{
 process.env.JWT_SECRET='test-only-secret-for-isolated-http-32-bytes';delete process.env.AGENTARTS_RUNTIME_URL;delete process.env.AGENTARTS_API_KEY;delete process.env.DEEPSEEK_API_KEY;delete process.env.PLANNING_PROVIDER;
 const db=new PrismaClient();const app=express();app.use(express.json());app.use('/api/agent',agentRouter(db));
 const server=await new Promise(resolve=>{const s=app.listen(0,'127.0.0.1',()=>resolve(s));});const base='http://127.0.0.1:'+server.address().port+'/api/agent';
 const token=jwt.sign({userId:'isolated-test-user'},process.env.JWT_SECRET,{algorithm:'HS256',issuer:'keling-server',audience:'keling-clients'});const headers={Authorization:'Bearer '+token,'Content-Type':'application/json'};
 try{
  assert.equal((await fetch(base+'/runs')).status,401);
  const status=await fetch(base+'/status',{headers});assert.equal((await status.json()).configured,false);
  assert.equal((await fetch(base+'/runs',{method:'POST',headers,body:'{}'})).status,503);
  assert.equal((await fetch(base+'/runs/not-owned',{headers})).status,404);
  assert.equal((await fetch(base+'/tools/search',{method:'POST',headers,body:'{}'})).status,401);
 }finally{await new Promise(r=>server.close(r));await db.$disconnect();}
});
