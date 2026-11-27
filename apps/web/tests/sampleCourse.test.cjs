const {test}=require('node:test');
const assert=require('node:assert/strict');
const harness=require('./expeditionHarness.cjs');

test('sample eligibility uses explicit marker or real history, never a subject name or generated planet',()=>{
 const h=harness();
 assert.equal(h.isBinaryTreeCourse({name:'二叉树',code:''}),false);
 assert.equal(h.isBinaryTreeCourse({code:'SAMPLE'}),true);
 assert.equal(h.isBinaryTreeCourse({code:'',hasBinaryTreeHistory:true}),true);
 assert.equal(h.isBinaryTreeCourse({code:'AI_PLANET',hasBinaryTreeHistory:true}),false);
});
test('ordinary course chapter reads and starts are rejected; empty sample reads are not history, actual runs are retained',async()=>{
 const h=harness();h.guest(false);const course=(await h.handleGuestData('POST','/courses',{name:'英语'})).course;
 await assert.rejects(h.guestExpeditionRequest('GET',`/courses/${course.id}/chapters/binary-tree`),error=>error.response.data.code==='SAMPLE_REQUIRED');
 await assert.rejects(h.guestExpeditionRequest('POST','/runs',{opId:crypto.randomUUID(),courseId:course.id,questKind:'EXPLORE',objectiveKey:'bt.bfs.queue',mode:'TRAINING',deviceId:'device'}),error=>error.response.data.code==='SAMPLE_REQUIRED');
 assert.equal(h.guestExpeditionContext(course.id).length,0);assert.equal(h.getGuestWorkspace().nodes.length,0);
 const sample=h.seedGuestSample();await h.guestExpeditionRequest('GET',`/courses/${sample.id}/chapters/binary-tree`);assert.equal(h.getGuestWorkspace().courses.find(c=>c.id===sample.id).hasBinaryTreeHistory,false);
 await h.handleGuestData('PUT',`/courses/${sample.id}`,{code:''});await assert.rejects(h.guestExpeditionRequest('GET',`/courses/${sample.id}/chapters/binary-tree`),error=>error.response.data.code==='SAMPLE_REQUIRED');
 await h.handleGuestData('PUT',`/courses/${sample.id}`,{code:'SAMPLE'});await h.guestExpeditionRequest('POST','/runs',{opId:crypto.randomUUID(),courseId:sample.id,questKind:'EXPLORE',objectiveKey:'bt.bfs.queue',mode:'TRAINING',deviceId:'device'});
 await h.handleGuestData('PUT',`/courses/${sample.id}`,{code:''});const reopened=await h.guestExpeditionRequest('GET',`/courses/${sample.id}/chapters/binary-tree`);assert.equal(reopened.runs.length,1);assert.equal(h.getGuestWorkspace().courses.find(c=>c.id===sample.id).hasBinaryTreeHistory,true);
});
