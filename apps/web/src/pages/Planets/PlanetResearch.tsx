import type { PlanetDraft } from '@keling/shared';
import { sourceUrl } from './practiceAnswers';

export function PlanetResearch({ draft }: { draft: PlanetDraft }) {
  const research=draft.research;
  const meaning=draft.meaningAnalysis;
  if(!research&&!meaning)return null;
  const sources=research?.sources.filter(s=>sourceUrl(s.url))||[];
  return <section className="planet-panel planet-research" aria-label="主题语境与参考资料">
    {research&&<p className="planet-research-intent"><strong>本次探索</strong>{research.intent}</p>}
    {meaning&&<details className="planet-meaning" open><summary>理解主题的不同语境</summary><p>{meaning.overview}</p><div className="planet-meaning-grid">{meaning.interpretations.map((item,index)=><article key={index}><h3>{item.label}</h3><p>{item.description}</p><p className="planet-fine">{item.context}</p></article>)}</div>{meaning.contrasts.length>0&&<ul>{meaning.contrasts.map((value,index)=><li key={index}>{value}</li>)}</ul>}{meaning.caveats.length>0&&<p className="planet-fine">{meaning.caveats.join('；')}</p>}</details>}
    {research&&(research.status==='grounded'&&sources.length>0?<details><summary>参考资料 {sources.length} 篇</summary><ol>{sources.map(source=><li key={source.id}><a href={sourceUrl(source.url)} target="_blank" rel="noopener noreferrer">{source.title}</a>{source.publishedAt&&<time>{source.publishedAt}</time>}<p>{source.snippet}</p></li>)}</ol></details>:<p className="planet-fine">{research.status==='unavailable'?'本次未取得联网检索资料。':'本次检索资料不足。'}</p>)}
  </section>;
}

export function QuestionSources({ draft, ids }: { draft: PlanetDraft; ids?: string[] }) {
  const sources=draft.research?.sources.filter(s=>ids?.includes(s.id)&&sourceUrl(s.url))||[];
  if(!sources.length)return null;
  return <div className="planet-question-sources"><span>参考资料</span>{sources.map(s=><a href={sourceUrl(s.url)} target="_blank" rel="noopener noreferrer" key={s.id}>{s.title}</a>)}</div>;
}
