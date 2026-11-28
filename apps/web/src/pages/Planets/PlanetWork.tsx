import type { PlanetWorkActivity, PlanetWorkKind, PlanetWorkProgress, PlanetWorkStepId } from '@keling/shared';
import { useEffect, useRef, useState } from 'react';
import { appPath } from '../../services/appPath';
import { useAppStore } from '../../store/useAppStore';
import { readExpeditionLocal } from '../../services/expeditionStorage';
import { subscribeExpedition } from '../../services/expedition';
import './PlanetWork.css';

const titles:Record<PlanetWorkKind,string>={planet:'新星球，启航准备中',artwork:'寻找星球的新模样',question:'重新编织这道练习',similar:'循着线索，探索相似碎片'};
const labels:Record<PlanetWorkStepId,string>={research:'搜集知识碎片',compose:'编织学习航线',review:'核对知识坐标',visual_prepare:'寻找星球模样',artwork:'绘制星球形象',finalize:'收拢启航行囊'};
const activities:Record<PlanetWorkActivity,string>={searching:'联网检索中',drafting:'正在组织内容',validating:'正在检查结构',reviewing:'正在核对内容',repairing:'正在修订并复核',visual_search:'正在检索形象',visual_design:'正在设计形象',visual_reference:'正在参考原图',rendering:'正在绘制',packaging:'正在保存',reusing_evidence:'沿用本次资料',ready:'准备就绪',unavailable:'暂未完成'};
const stateLabels={pending:'待开始',running:'进行中',completed:'已完成',failed:'未完成',skipped:'已跳过'};

export function PlanetWork({kind,progress}:{kind:PlanetWorkKind;progress?:PlanetWorkProgress}) {
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{panel.current?.scrollIntoView({block:'nearest',behavior:'instant'});},[]);
  const {user,isGuest}=useAppStore();
  const [reducedMotion,setReducedMotion]=useState(false);
  const userId=user?.id;
  useEffect(()=>{if(!userId)return;let alive=true;const scope={kind:isGuest?'guest' as const:'account' as const,id:userId};const read=()=>void readExpeditionLocal(scope).then(value=>{if(alive)setReducedMotion(value.preferences?.reducedMotion===true);}).catch(()=>undefined);read();const unsubscribe=subscribeExpedition(key=>{if(key===`${scope.kind}:${scope.id}`)read();});return()=>{alive=false;unsubscribe();};},[userId,isGuest]);
  const steps=progress?.kind===kind?progress.steps:undefined;
  const completed=steps?.filter(step=>step.state==='completed').length||0;
  const failed=steps?.some(step=>step.state==='failed')||false;
  const running=steps?.filter(step=>step.state==='running')||[];
  const status=running.length?running.map(step=>step.activity?activities[step.activity]:labels[step.id]).join(' · '):failed?'这次航程暂未完成':steps?.every(step=>step.state==='completed'||step.state==='skipped')?'本次准备已结束':'正在连接星际工作站';
  return <section ref={panel} className="planet-work" data-active={!failed} data-motion={reducedMotion?'reduce':undefined} aria-label={titles[kind]}>
    <div className="planet-work-heading"><div className="planet-work-orbit" aria-hidden="true"><span/><img src={appPath('/stellar/mascot_welcome.webp')} alt=""/></div><div><span className="planet-work-eyebrow">星芽的启航工作站</span><h3>{titles[kind]}</h3><p role="status" aria-live="polite">{running.length?running.map(step=><span key={step.id}>{step.activity?activities[step.activity]:labels[step.id]}</span>):status}</p></div></div>
    <div className="planet-work-meter" role="progressbar" aria-label="已完成环节" aria-valuemin={steps?0:undefined} aria-valuemax={steps?.length} aria-valuenow={steps?completed:undefined} aria-valuetext={steps?`已完成 ${completed} / ${steps.length} 个环节`:'等待工作站进度'}>
      {steps?steps.map(step=><span key={step.id} data-state={step.state}/>):<span className="planet-work-indeterminate"/>}
    </div>
    {steps&&<><p className="planet-work-count">已完成 {completed} / {steps.length} 个环节</p><ol className="planet-work-steps">{steps.map(step=><li key={step.id} data-state={step.state}><span aria-hidden="true"/><strong>{labels[step.id]}</strong><small>{stateLabels[step.state]}</small></li>)}</ol></>}
    <div className="planet-work-story" aria-hidden="true"><div><span>好奇心，是探索的第一束光。</span><span>把问题装进行囊，沿着线索出发。</span><span>每一次追问，都在拓宽知识星图。</span><span>星芽陪你寻找下一条航线。</span></div></div>
  </section>;
}
