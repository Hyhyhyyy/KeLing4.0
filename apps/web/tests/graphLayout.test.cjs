const {test}=require('node:test'),assert=require('node:assert/strict'),harness=require('./expeditionHarness.cjs');
async function workspace(){const h=harness();h.guest(false);const {course}=await h.handleGuestData('POST','/courses',{name:'英语知识星图'});const {node:a}=await h.handleGuestData('POST',`/knowledge/${course.id}/nodes`,{name:'问候'});const {node:b}=await h.handleGuestData('POST',`/knowledge/${course.id}/nodes`,{name:'介绍',parentIds:[a.id]});return {h,course,a,b};}
const position=(node,x=.5,y=.5)=>({id:node.id,positionX:x,positionY:y,expectedUpdatedAt:node.updatedAt});
test('fresh automatic positions are unsaved; explicit guest save persists exact coordinates and survives reopening',async()=>{
 const {h,course,a,b}=await workspace();assert.equal((await h.handleGuestData('GET',`/knowledge/${course.id}/nodes`)).layoutSaved,false);
 const saved=await h.handleGuestData('PUT',`/knowledge/${course.id}/layout`,{positions:[position(a,.5,.5),position(b,.7,.2)]});assert.equal(saved.layoutSaved,true);assert.equal(saved.savedNodeIds.length,2);
 const reopened=await h.handleGuestData('GET',`/knowledge/${course.id}/nodes`);assert.equal(reopened.layoutSaved,true);assert.equal(reopened.nodes.find(n=>n.id===a.id).positionX,.5);assert.equal(reopened.nodes.find(n=>n.id===b.id).positionY,.2);assert.notEqual(saved.nodes[0].updatedAt,a.updatedAt);
 const {node:c}=await h.handleGuestData('POST',`/knowledge/${course.id}/nodes`,{name:'新内容'});const changed=await h.handleGuestData('GET',`/knowledge/${course.id}/nodes`);assert.equal(changed.layoutSaved,false);assert.equal(changed.savedNodeIds.includes(c.id),false);assert.equal(changed.savedNodeIds.length,2);
});
test('stale timestamps and foreign nodes reject the entire layout without partial updates',async()=>{
 const {h,course,a,b}=await workspace();await h.handleGuestData('PUT',`/knowledge/node/${b.id}`,{name:'已编辑'});
 await assert.rejects(()=>h.handleGuestData('PUT',`/knowledge/${course.id}/layout`,{positions:[position(a,.2,.3),position(b,.8,.4)]}),e=>e.response.status===409);
 let data=await h.handleGuestData('GET',`/knowledge/${course.id}/nodes`);assert.equal(data.nodes.find(n=>n.id===a.id).positionX,.5);assert.equal(data.layoutSaved,false);
 const {course:other}=await h.handleGuestData('POST','/courses',{name:'另一门课程'});await assert.rejects(()=>h.handleGuestData('PUT',`/knowledge/${other.id}/layout`,{positions:[position(a)]}),e=>e.response.status===404);
 data=await h.handleGuestData('GET',`/knowledge/${course.id}/nodes`);const before=JSON.stringify(data);await assert.rejects(()=>h.handleGuestData('PUT',`/knowledge/${course.id}/layout`,{positions:[position(data.nodes[0],.2,.3),position(data.nodes[1],Infinity,.5)]}));assert.equal(JSON.stringify(await h.handleGuestData('GET',`/knowledge/${course.id}/nodes`)),before);
});
test('single center node has explicit saved metadata; visitor cleanup clears both data and layout markers',async()=>{
 const {h,course,a,b}=await workspace();await h.handleGuestData('DELETE',`/knowledge/node/${b.id}`);const saved=await h.handleGuestData('PUT',`/knowledge/${course.id}/layout`,{positions:[position(a)]});assert.equal(saved.layoutSaved,true);
 h.endGuestSession();h.guest(false);assert.equal(h.getGuestWorkspace().nodes.length,0);await assert.rejects(()=>h.handleGuestData('GET',`/knowledge/${course.id}/nodes`));
});
