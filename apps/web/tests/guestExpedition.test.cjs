const {test} = require('node:test');
const assert = require('node:assert/strict');
const harness = require('./expeditionHarness.cjs');
const h = harness(), request = h.guestExpeditionRequest;
const id = () => crypto.randomUUID();
let runCounter = 0;
async function start(objective = 'bt.bfs.queue', kind = 'EXPLORE', mode = 'TRAINING') {
  return request('POST', '/runs', {opId:id(),courseId:h.getGuestWorkspace().courses[0].id,objectiveKey:objective,questKind:kind,mode,deviceId:'test-device-' + ++runCounter});
}
async function command(state, action, opId = id()) {
  const result = await request('POST', `/runs/${state.run.id}/commands`, {opId,expectedRevision:state.run.revision,writer:state.writer,action});
  return {...result,writer:state.writer};
}
function answer(state) {
  const exercise = h.CHAPTER.exercises.find(ex => ex.id === state.run.exerciseIds[state.run.exerciseIndex]);
  return {...h.expectedAnswer(exercise),structure:exercise.objectiveKey==='bt.bfs.queue'?'QUEUE':'STACK'};
}
test('three real objectives settle once, never grant strict badges, and fund the first single-slot building', async () => {
  h.guest(); let final;
  for (const objective of h.CHAPTER.objectives) {
    let state = await start(objective.key);
    state = await command(state,{type:'SUBMIT',answer:answer(state)});
    assert.equal(state.account.crystals, final ? final.account.crystals : 0);
    const op = id(), payload = {opId:op,expectedRevision:state.run.revision,writer:state.writer,action:{type:'ACK_FEEDBACK',nextStep:'换一棵树核对规则'}};
    final = await request('POST', `/runs/${state.run.id}/commands`, payload);
    await request('POST', `/runs/${state.run.id}/commands`, payload);
    assert.equal(final.evidenceDelta.length,1); assert.equal(final.evidenceDelta[0].strict,false);
  }
  const before = await request('GET','/rewards'); assert.equal(before.account.crystals,6); assert.equal(before.account.exp,30);
  const buy = {opId:id(),expectedRevision:before.account.revision,decorationId:'antenna',action:'BUY'};
  const bought = await request('POST','/base/commands',buy); await request('POST','/base/commands',buy);
  assert.equal(bought.account.crystals,0); assert.equal(bought.account.world.slot.decorationId,'antenna');
  assert.equal((await request('GET','/rewards')).account.crystals,0);
});
test('wrong structure, repairs, teach explanations and hints keep evidence without false mastery', async () => {
  h.guest(); let state = await start('bt.bfs.queue','EXPLORE','INDEPENDENT');
  state = await command(state,{type:'SUBMIT',answer:{...answer(state),structure:'STACK'}});
  assert.equal(state.feedback.correct,false);
  state = await command(state,{type:'HINT'}); assert.equal(state.feedback.independentEligible,false);
  state = await command(state,{type:'SUBMIT',answer:answer(state)});
  state = await command(state,{type:'ACK_FEEDBACK',nextStep:'下次先检查容器'}); assert.equal(state.evidenceDelta[0].strict,false);
  let taught = await start('bt.dfs.stack','TEACH'); const ex=h.CHAPTER.exercises.find(ex=>ex.id===taught.run.exerciseIds[0]);
  taught = await command(taught,{type:'SUBMIT',answer:{explanation:'我使用栈保存尚未访问的分支，并说明为什么要注意入栈顺序。',selfCheck:ex.rubric}});
  assert.equal(taught.feedback.correct,null); assert.equal(taught.feedback.kind,'SELF_REPORTED');
  taught = await command(taught,{type:'ACK_FEEDBACK',nextStep:'实际换树核对',saveCompanion:true});
  const memory=taught.progress.state.companionMemories[0]; assert.equal(memory.verification,'SELF_REPORTED');
  const path=`/progress/${encodeURIComponent(taught.progress.id)}/memory`;
  const updated=await request('POST',path,{opId:id(),expectedRevision:taught.progress.revision,memoryId:memory.id,action:'UPDATE',text:'修订：栈需要先压右孩子，再压左孩子。'});
  const removed=await request('POST',path,{opId:id(),expectedRevision:updated.progress.revision,memoryId:memory.id,action:'DELETE'});
  assert.equal(removed.progress.state.companionMemories[0].text,''); assert.equal(removed.progress.state.companionMemories[0].sources.length,0);
});
test('pause/resume, closed-run lease refusal, stale revision and explicit takeover protect one writer', async () => {
  h.guest(); let state=await start(); state=await command(state,{type:'PAUSE'});
  await assert.rejects(command(state,{type:'SUBMIT',answer:answer(state)}));
  state=await command(state,{type:'RESUME'});
  await assert.rejects(request('POST',`/runs/${state.run.id}/lease`,{opId:id(),expectedRevision:state.run.revision,deviceId:'other',intent:'acquire'}),e=>e.response.status===409);
  const takeover=await request('POST',`/runs/${state.run.id}/lease`,{opId:id(),expectedRevision:state.run.revision,deviceId:'other',intent:'takeover'});
  assert.equal(takeover.run.revision,state.run.revision+1);
  await assert.rejects(command(state,{type:'HINT'}),e=>e.response.status===409);
  const closed=await command(takeover,{type:'CANCEL'});
  await assert.rejects(request('POST',`/runs/${closed.run.id}/lease`,{opId:id(),expectedRevision:closed.run.revision,deviceId:'other',intent:'acquire'}),e=>e.response.status===409);
});
test('delayed review rejects early access and idempotency rejects a changed action', async () => {
  h.guest(); let state=await start(); state=await command(state,{type:'SUBMIT',answer:answer(state)});
  const opId=id(),payload={opId,expectedRevision:state.run.revision,writer:state.writer,action:{type:'ACK_FEEDBACK',nextStep:'明天再练'}};
  await request('POST',`/runs/${state.run.id}/commands`,payload);
  await assert.rejects(request('POST',`/runs/${state.run.id}/commands`,{...payload,action:{type:'CANCEL'}}),e=>e.response.status===409);
  await assert.rejects(start('bt.bfs.queue','REVIEW'));
});
test('finishing a guest session during hashing prevents a late run in the replacement workspace', async () => {
  h.guest(); const original=crypto.subtle.digest; let release;
  crypto.subtle.digest=(...args)=>new Promise(resolve=>{release=()=>original.apply(crypto.subtle,args).then(resolve);});
  try { const pending=start(); const rejected=assert.rejects(pending,e=>e.response.status===401); h.guest(); await release(); await rejected;
    const chapter=await request('GET',`/courses/${h.getGuestWorkspace().courses[0].id}/chapters/binary-tree`); assert.equal(chapter.runs.length,0);
  } finally {crypto.subtle.digest=original;}
});
test('self-reports deduplicate changed operation IDs, cap daily XP, record real minutes and award no crystals', async () => {
  h.guest(); const report={opId:id(),title:'线下练习二叉树',durationMinutes:25,notes:'纸上推演'};
  await request('POST','/self-report',report); const duplicate=await request('POST','/self-report',{...report,opId:id()}); assert.equal(duplicate.alreadyRecorded,true);
  for(let i=0;i<5;i++) await request('POST','/self-report',{...report,opId:id(),title:'不同线下记录 '+i});
  const rewards=await request('GET','/rewards'); assert.equal(rewards.account.exp,10); assert.equal(rewards.account.crystals,0); assert.equal(h.getGuestWorkspace().user.totalStudyMinutes,150);
  const history=await request('GET','/self-report');assert.equal(history.records.length,6);assert.ok(history.records.some(record=>record.notes.includes('纸上推演')));assert.equal(history.nextCursor,null);
});
test('real queue/stack transitions reject impossible operations and agree with the shared evaluator', () => {
  const ex=h.CHAPTER.exercises.find(ex=>ex.objectiveKey==='bt.dfs.stack'&&ex.template==='ROUTE_REPAIR');
  const steps=[{type:'PUSH',nodeId:ex.tree.root}], nodes=new Map(ex.tree.nodes.map(node=>[node.id,node])); const frontier=[ex.tree.root];
  while(frontier.length){const id=frontier.pop();steps.push({type:'POP',nodeId:id});const node=nodes.get(id);for(const child of [node.right,node.left].filter(Boolean)){steps.push({type:'PUSH',nodeId:child});frontier.push(child);}}
  const result=h.treeOperationState(ex.tree,steps,'STACK'); assert.equal(result.order.join(','),h.expectedAnswer(ex).order.join(','));
  assert.equal(h.evaluate(ex,{structure:'STACK',order:result.order,steps}).correct,true);
  assert.throws(()=>h.treeOperationState(ex.tree,[{type:'PUSH',nodeId:'unknown'}],'QUEUE'));
});
