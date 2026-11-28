import { Link } from 'react-router-dom';
import type { useCoursePlanets } from '../services/useCoursePlanets';
import { NavigationArrow } from './NavigationArrow';
import { SectionTitle } from './ModuleTitle';

export function PlanetCourseEntry({courseId,subject,planets}:{courseId:string;subject:string;planets:ReturnType<typeof useCoursePlanets>}) {
  const current=planets.loading?null:{error:planets.error,planetId:planets.byCourse[courseId]?.id||''};
  return <section className="exp-panel"><SectionTitle kind="courses">学习远航</SectionTitle>{current?.error?<p role="alert">{current.error} <button onClick={planets.refresh}>重新读取</button></p>:current?<Link className="btn btn-primary" to={current.planetId?'/planets/'+encodeURIComponent(current.planetId):'/start?subject='+encodeURIComponent(subject)}>{current.planetId?'继续探索学习星球':'为这门学科生成星球'} <NavigationArrow/></Link>:<p role="status">正在读取学习星球…</p>}</section>;
}
