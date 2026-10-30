const {test} = require('node:test'); const assert=require('node:assert/strict'); const harness=require('./expeditionHarness.cjs');
const id=()=>crypto.randomUUID(); const ok=(config,data)=>({data,status:200,statusText:'OK',headers:{},config});
const failed=(status,config,message)=>Object.assign(new Error(message),{config,response:{status,data:{error:message}}});
async function fixture(){const h=harness();h.guest();const start=await h.guestExpeditionRequest('POST','/runs',{opId:id(),courseId:h.getGuestWorkspace().courses[0].id,questKind:'EXPLORE',objectiveKey:'bt.bfs.queue',mode:'TRAINING',deviceId:'fixture'});const scope=h.account();const local=await h.readExpeditionLocal(scope);start.writer.deviceId=local.deviceId;start.run.writerDeviceId=local.deviceId;return {h,scope,start,local};}
test('lost response retries the identical operation and acknowledges its original receipt once',async()=>{
 const {h,scope,start}=await fixture();let calls=0,created=0;const receipts=new Map();
 h.transport.defaults.adapter=async config=>{const body=JSON.parse(config.data);calls++;if(!receipts.has(body.opId)){created++;receipts.set(body.opId,start);}if(calls===1)throw new Error('network response lost');return ok(config,receipts.get(body.opId));};
 const result=await h.mutateExpedition(scope,'/runs',{opId:'original-op',mode:'TRAINING'});assert.equal(result.queued,true);assert.equal((await h.readExpeditionLocal(scope)).outbox.length,1);
 await h.flushExpedition(scope);assert.equal(created,1);assert.equal(calls,2);assert.equal((await h.readExpeditionLocal(scope)).outbox.length,0);assert.equal(h.expeditionSnapshot(await h.readExpeditionLocal(scope)).runs[start.run.id].run.id,start.run.id);
});
test('HTTP conflict preserves the original answer/revision and stops FIFO before later operations',async()=>{
 const {h,scope,start}=await fixture();await h.saveExpeditionSnapshot(scope,{courses:[],chapters:{},runs:{[start.run.id]:start},writers:{[start.run.id]:start.writer},account:start.account,grants:[],evidence:[]});
 h.transport.defaults.adapter=async()=>{throw new Error('offline');};await h.actOnExpedition(scope,start.run.id,{type:'SUBMIT',answer:{structure:'QUEUE',order:['original']}});await h.mutateExpedition(scope,'/self-report',{opId:'later',title:'later',durationMinutes:10});
 const before=await h.readExpeditionLocal(scope), original=JSON.stringify(before.outbox[0].command);let calls=0;
 h.transport.defaults.adapter=async config=>{calls++;throw failed(409,config,'another device changed this run');};await assert.rejects(h.flushExpedition(scope));
 const after=await h.readExpeditionLocal(scope);assert.equal(calls,1);assert.equal(after.outbox[0].status,'conflict');assert.equal(JSON.stringify(after.outbox[0].command),original);assert.equal(after.outbox[1].status,'pending');
 await h.flushExpedition(scope);assert.equal(calls,1);
});
test('an older successful receipt or delayed chapter GET cannot roll back newer revisions/balance',async()=>{
 const {h,scope,start}=await fixture();let response=structuredClone(start);response.run.revision=9;response.progress.revision=9;response.account.revision=9;response.account.crystals=12;
 h.transport.defaults.adapter=async config=>ok(config,response);await h.mutateExpedition(scope,'/runs',{opId:'new'});
 response=structuredClone(start);await h.mutateExpedition(scope,'/runs',{opId:'old'});
 h.transport.defaults.adapter=async config=>ok(config,config.url.endsWith('/evidence')?{evidence:[]}:{chapter:h.CHAPTER,...start,runs:[start.run],serverTime:new Date().toISOString()});await h.refreshExpeditionChapter(scope,start.run.courseId);
 const snapshot=h.expeditionSnapshot(await h.readExpeditionLocal(scope));assert.equal(snapshot.account.crystals,12);assert.equal(snapshot.account.revision,9);assert.equal(snapshot.runs[start.run.id].run.revision,9);assert.equal(snapshot.chapters[start.run.courseId].progress.revision,9);
});
test('a late response after account switch never populates the replacement account',async()=>{
 const {h,scope,start}=await fixture();let release,started;const sent=new Promise(resolve=>{started=resolve;});h.transport.defaults.adapter=config=>new Promise(resolve=>{release=()=>resolve(ok(config,start));started();});
 const operation=h.mutateExpedition(scope,'/runs',{opId:'late'});await sent;const second=h.account('account-b');release();await operation;
 assert.equal((await h.readExpeditionLocal(second)).snapshot,null);assert.equal(h.useAppStore.getState().user.id,'account-b');assert.equal((await h.readExpeditionLocal(scope)).outbox.length,1);
});
test('renewal may replace only the token of the same epoch; the queued action/base revision remain immutable',async()=>{
 const {h,scope,start}=await fixture();await h.saveExpeditionSnapshot(scope,{courses:[],chapters:{},runs:{[start.run.id]:start},writers:{[start.run.id]:start.writer},account:start.account,grants:[],evidence:[]});
 h.transport.defaults.adapter=async()=>{throw new Error('offline');};await h.actOnExpedition(scope,start.run.id,{type:'PAUSE'});
 await h.updateExpeditionLocal(scope,local=>{h.expeditionSnapshot(local).writers[start.run.id].token='renewed-token';});let received;
 h.transport.defaults.adapter=async config=>{received=JSON.parse(config.data);return ok(config,{...start,run:{...start.run,revision:start.run.revision+1}});};await h.flushExpedition(scope);
 assert.equal(received.writer.token,'renewed-token');assert.equal(received.expectedRevision,start.run.revision);assert.equal(received.action.type,'PAUSE');
});
test('offline entry requires the exact previously server-verified identity and never falls back on HTTP rejection',async()=>{
 const h=harness();h.account('verified');const user={id:'verified',name:'verified person',level:1,exp:0,crystals:0};
 await h.rememberExpeditionIdentity(user,'verified-verified');h.useAppStore.setState({user:null,isAuthenticated:false,offlineAccount:false});
 h.transport.defaults.adapter=async()=>{throw new Error('network unavailable');};await h.useAppStore.getState().loadUser();assert.equal(h.useAppStore.getState().offlineAccount,true);assert.equal(h.useAppStore.getState().user.id,'verified');
 h.useAppStore.setState({user:null,isAuthenticated:false,offlineAccount:false});h.transport.defaults.adapter=async config=>{throw failed(403,config,'access rejected');};await h.useAppStore.getState().loadUser();assert.equal(h.useAppStore.getState().user,null);assert.equal(h.useAppStore.getState().offlineAccount,false);
 h.context.localStorage.setItem('token','unknown-token');h.useAppStore.setState({user:null,isAuthenticated:false,offlineAccount:false});h.transport.defaults.adapter=async()=>{throw new Error('offline');};await h.useAppStore.getState().loadUser();assert.equal(h.useAppStore.getState().user,null);assert.ok(h.useAppStore.getState().authError);
});
