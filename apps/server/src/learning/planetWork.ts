import { AsyncLocalStorage } from 'node:async_hooks';
import type { PlanetWorkKind,PlanetWorkProgress,PlanetWorkStepId,PlanetWorkActivity } from '@keling/shared';

const context=new AsyncLocalStorage<PlanetWorkTracker>();

/** Milestones describe completed work, never a guessed fraction of model inference. */
export class PlanetWorkTracker {
  private value:PlanetWorkProgress;
  private closed=false;
  constructor(kind:PlanetWorkKind,artwork:boolean,onChange:(progress:PlanetWorkProgress)=>void){
    const at=new Date().toISOString();
    const ids:PlanetWorkStepId[]=kind==='artwork'?['visual_prepare','artwork','finalize']:kind==='planet'&&artwork?['research','compose','review','visual_prepare','artwork','finalize']:['research','compose','review','finalize'];
    this.value={kind,revision:0,startedAt:at,updatedAt:at,steps:ids.map(id=>({id,state:'pending'}))};
    this.onChange=onChange;
  }
  private readonly onChange:(progress:PlanetWorkProgress)=>void;
  snapshot(){return structuredClone(this.value);}
  update(id:PlanetWorkStepId,state:'running'|'completed'|'failed'|'skipped',activity?:PlanetWorkActivity){
    if(this.closed)return;
    const step=this.value.steps.find(step=>step.id===id);
    if(!step||step.state==='completed'||step.state==='skipped'||step.state==='failed')return;
    if(step.state===state&&step.activity===activity)return;
    const at=new Date().toISOString();
    if(!step.startedAt)step.startedAt=at;
    step.state=state;if(activity)step.activity=activity;
    if(state!=='running')step.finishedAt=at;
    this.value.updatedAt=at;this.value.revision++;this.onChange(this.snapshot());
  }
  finish(success:boolean){
    if(this.closed&&success)return this.snapshot();
    if(this.closed&&this.value.steps.find(step=>step.id==='finalize')?.state!=='completed')return this.snapshot();
    this.closed=true;
    const at=new Date().toISOString();
    const set=(step:PlanetWorkProgress['steps'][number],state:'completed'|'failed'|'skipped',activity:PlanetWorkActivity)=>{step.state=state;step.activity=activity;step.startedAt??=at;step.finishedAt=at;};
    if(success){
      // A cache hit may return before work begins. Unperformed work is skipped, not called completed.
      for(const step of this.value.steps)if(step.id!=='finalize'&&step.state==='pending')set(step,'skipped','reusing_evidence');
      set(this.value.steps.find(step=>step.id==='finalize')!,'completed','ready');
    }else{
      const active=this.value.steps.filter(step=>step.state==='running');
      if(active.length)for(const step of active)set(step,'failed','unavailable');
      else set(this.value.steps.find(step=>step.id==='finalize')!,'failed','unavailable');
    }
    this.value.updatedAt=at;this.value.revision++;return this.snapshot();
  }
}

export function runWithPlanetWork<T>(tracker:PlanetWorkTracker,operation:()=>Promise<T>){return context.run(tracker,operation);}
export function planetStep(id:PlanetWorkStepId,state:'running'|'completed'|'failed'|'skipped',activity?:PlanetWorkActivity){context.getStore()?.update(id,state,activity);}
export async function planetWorkStep<T>(id:PlanetWorkStepId,activity:PlanetWorkActivity,operation:()=>Promise<T>){
  planetStep(id,'running',activity);
  const result=await operation();planetStep(id,'completed');return result;
}
