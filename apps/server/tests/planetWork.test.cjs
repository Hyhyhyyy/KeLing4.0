const {test}=require('node:test');
const assert=require('node:assert/strict');
const {PlanetWorkTracker,runWithPlanetWork,planetStep,planetWorkStep}=require('../src/learning/planetWork');

test('work milestones describe awaited completion and isolate simultaneous requests',async()=>{
 const events=[],a=new PlanetWorkTracker('planet',true,p=>events.push(p)),b=new PlanetWorkTracker('question',false,()=>{});let release;
 const pending=runWithPlanetWork(a,()=>planetWorkStep('research','searching',()=>new Promise(resolve=>{release=resolve;})));
 await runWithPlanetWork(b,async()=>{planetStep('compose','running','drafting');});
 assert.equal(a.snapshot().steps[0].state,'running');assert.equal(b.snapshot().steps[0].state,'pending');assert.equal(a.snapshot().steps[1].state,'pending');
 release('searched');assert.equal(await pending,'searched');assert.equal(a.snapshot().steps[0].state,'completed');assert.deepEqual(events.map(p=>p.revision),[1,2]);
 events[0].steps[0].state='failed';assert.equal(a.snapshot().steps[0].state,'completed');
});

test('final results are silent and late callbacks cannot overwrite failed or successful jobs',()=>{
 const events=[],tracker=new PlanetWorkTracker('artwork',true,p=>events.push(p));tracker.update('visual_prepare','running','visual_search');tracker.update('visual_prepare','completed');tracker.update('artwork','running','rendering');
 const failed=tracker.finish(false),count=events.length;assert.equal(failed.steps.find(s=>s.id==='artwork').state,'failed');assert.notEqual(failed.steps.find(s=>s.id==='finalize').state,'completed');tracker.update('artwork','completed');assert.deepEqual(tracker.snapshot(),failed);assert.equal(events.length,count);
 const cached=new PlanetWorkTracker('question',false,()=>assert.fail('finish must be atomic with terminal job persistence'));const result=cached.finish(true);assert.ok(result.steps.slice(0,-1).every(s=>s.state==='skipped'));assert.equal(result.steps.at(-1).state,'completed');
 const persistenceFailure=cached.finish(false);assert.equal(persistenceFailure.steps.at(-1).state,'failed');assert.ok(persistenceFailure.revision>result.revision);
});
