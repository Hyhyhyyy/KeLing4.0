import { useRef, useState } from 'react';
import type { PlanetQuestion, PlanetRecord, PlanetFeedback } from '@keling/shared';
import { NavigationArrow } from '../../components/NavigationArrow';
import { SectionTitle } from '../../components/ModuleTitle';
import { planetAPI, planetError } from '../../services/planets';
import type { PlanetResponse } from '../../services/planets';
import { moveOrder, questionKind, questionLabels, questionResponse } from './practiceAnswers';
import { PlanetRegenerate } from './PlanetRegenerate';
import { PlanetSimilar } from './PlanetSimilar';
import { PlanetHint } from './PlanetHint';

export type PracticeRecord={question:PlanetQuestion;response:PlanetResponse;feedback:PlanetFeedback};
type Props={planet:PlanetRecord;regionIndex:number;questionIndex:number;busy:boolean;setBusy:(v:boolean)=>void;setError:(v:string)=>void;onPlanet:(v:PlanetRecord)=>void;onNext:()=>void;onQuestion:(index:number)=>void;onResponse:(v:PracticeRecord)=>void};

export function PlanetPractice(props:Props) {
  const {planet,regionIndex,questionIndex,busy,setBusy,setError,onPlanet,onNext,onQuestion,onResponse}=props;
  const region=planet.draft.regions[regionIndex],q=region.questions[questionIndex],kind=questionKind(q),prior=planet.progress.answers[q.id];
  const [selected,setSelected]=useState<number|null>(prior?.selectedIndex??null),[multiple,setMultiple]=useState<number[]>(prior?.selectedIndices||[]),[answerText,setAnswerText]=useState(prior?.text||''),[order,setOrder]=useState(prior?.orderedIndices||q.options.map((_,i)=>i));
  const [feedback,setFeedback]=useState<PlanetFeedback|null>(null),[checks,setChecks]=useState<number[]>([]);
  const operation=useRef({signature:'',id:''});
  const response=questionResponse(q,selected,multiple,answerText,order);
  const reviewed=kind==='short_answer'&&prior?.reviewed===true;
  const completed=prior?.correct===true||reviewed;
  const reviewPoints=feedback?.rubric?.length?feedback.rubric:['已对照参考答案，检查自己的解释'];
  function clearFeedback(){setFeedback(null);setChecks([]);}
  async function submit(selfReview=false){
    const value=questionResponse(q,selected,multiple,answerText,order,selfReview);
    if(!value||busy)return;
    setBusy(true);setError('');
    const signature=JSON.stringify([planet.id,q.id,value]);
    if(operation.current.signature!==signature)operation.current={signature,id:crypto.randomUUID()};
    try{const result=await planetAPI.answer(planet.id,q.id,value,operation.current.id);onPlanet(result.planet);setFeedback(result.feedback);onResponse({question:q,response:value,feedback:result.feedback});}
    catch(e){setError(planetError(e));}finally{setBusy(false);}
  }
  return <section className="planet-panel planet-practice">
    <SectionTitle kind="voyage">探索练习 {questionIndex+1} / {region.questions.length}</SectionTitle>
    <nav className="planet-question-nav" aria-label="本区练习">{region.questions.map((item,i)=>{const answer=planet.progress.answers[item.id];return <button type="button" key={item.id} disabled={busy} aria-current={i===questionIndex?'step':undefined} aria-label={`第${i+1}题${answer?.correct||answer?.reviewed?'，已探索':''}`} onClick={()=>onQuestion(i)}>{i+1}{answer?.correct||answer?.reviewed?<span className="planet-question-done" aria-hidden="true"/>:null}</button>;})}</nav>
    <span className="planet-question-kind">{questionLabels[kind]}{q.similarTo?' · 相似碎片':''}</span>
    <fieldset className="planet-question" disabled={busy}><legend>{q.prompt}</legend>
      {['single_choice','true_false','multiple_choice'].includes(kind)&&q.options.map((option,index)=><label key={index} className={feedback&&(kind==='multiple_choice'?feedback.expectedIndices?.includes(index):index===feedback.expectedIndex)?'planet-answer-reference':''}><input type={kind==='multiple_choice'?'checkbox':'radio'} name={q.id} checked={kind==='multiple_choice'?multiple.includes(index):selected===index} onChange={()=>{if(kind==='multiple_choice')setMultiple(v=>v.includes(index)?v.filter(i=>i!==index):[...v,index]);else setSelected(index);clearFeedback();}}/><span>{kind==='true_false'?'':`${String.fromCharCode(65+index)}. `}{option}</span></label>)}
      {kind==='fill_blank'&&<label className="planet-text-answer"><span>你的答案</span><input type="text" autoComplete="off" value={answerText} maxLength={500} onChange={e=>{setAnswerText(e.target.value);clearFeedback();}} placeholder="填写关键词或短句"/></label>}
      {kind==='short_answer'&&<label className="planet-text-answer"><span>用自己的话回答</span><textarea value={answerText} maxLength={2000} rows={5} onChange={e=>{setAnswerText(e.target.value);clearFeedback();}} placeholder="写下你的解释、例子或判断依据"/></label>}
      {kind==='ordering'&&<ol className="planet-ordering">{order.map((index,position)=><li key={index}><span className="planet-order-number">{position+1}</span><span className="planet-order-text">{q.options[index]}</span><div className="planet-order-actions"><button type="button" disabled={busy||position===0} aria-label={`上移：${q.options[index]}`} onClick={()=>{setOrder(v=>moveOrder(v,position,-1));clearFeedback();}}><NavigationArrow direction="up"/></button><button type="button" disabled={busy||position===order.length-1} aria-label={`下移：${q.options[index]}`} onClick={()=>{setOrder(v=>moveOrder(v,position,1));clearFeedback();}}><NavigationArrow direction="down"/></button></div></li>)}</ol>}
    </fieldset>
    <PlanetHint draft={planet.draft} region={region} question={q}/>
    <button className="planet-primary" disabled={!response||busy} onClick={()=>void submit()}>{kind==='short_answer'?'提交并查看参考答案':'提交作答'} <NavigationArrow/></button>
    {feedback&&<div role="status" className="planet-feedback"><h3>{kind==='short_answer'?(reviewed?'已保存你的自核':'对照参考答案，自主核对'):feedback.correct?'与参考答案一致':'再看看这条线索'}</h3>
      {kind==='short_answer'&&feedback.referenceAnswer&&<p className="planet-reference-answer">{feedback.referenceAnswer}</p>}
      <p>{feedback.explanation}</p>
      {kind==='short_answer'&&!reviewed&&<><fieldset className="planet-self-review" disabled={busy}><legend>逐项核对</legend>{reviewPoints.map((point,index)=><label key={index}><input type="checkbox" checked={checks.includes(index)} onChange={()=>setChecks(v=>v.includes(index)?v.filter(i=>i!==index):[...v,index])}/><span>{point}</span></label>)}</fieldset><button className="planet-primary" disabled={busy||checks.length!==reviewPoints.length} onClick={()=>void submit(true)}>保存我的自核 <NavigationArrow/></button></>}
      {kind!=='short_answer'&&!feedback.correct&&<button disabled={busy} onClick={clearFeedback}>再试一次 <NavigationArrow/></button>}
      {completed&&<button disabled={busy} onClick={onNext}>{questionIndex+1<region.questions.length?'下一道练习':regionIndex+1<planet.draft.regions.length?'探索下一个区域':'完成本次探索'} <NavigationArrow/></button>}
    </div>}
    <PlanetSimilar busy={busy} limitReached={region.questions.length>28} setBusy={setBusy} setError={setError} onGenerate={async(instruction,requestId,signal)=>{onPlanet(await planetAPI.regenerate(planet.id,'similar',instruction,requestId,q.id,signal));}}/>
    <PlanetRegenerate kind="question" busy={busy} setBusy={setBusy} setError={setError} onRegenerate={async(instruction,requestId,signal)=>{const updated=await planetAPI.regenerate(planet.id,'question',instruction,requestId,q.id,signal);onPlanet(updated);}}/>
  </section>;
}
