import type { PlanetRecord } from '@keling/shared';
import { PlanetArtwork } from '../pages/Planets/PlanetArtwork';
import { SubjectPlanet } from './SubjectPlanet';

export function CourseArtwork({course,planet,loading,size}:{course:{name:string;code?:string|null;planetStyleIndex:number};planet?:PlanetRecord;loading:boolean;size:number}) {
  if (planet) return <PlanetArtwork draft={planet.draft} size={size}/>;
  if (course.code==='AI_PLANET') return <div className="planet-artwork" style={{width:size,maxWidth:'100%'}}><div className="planet-artwork-frame"><div className="planet-artwork-placeholder" role="status">{loading?'形象载入中':'形象待连接'}</div></div></div>;
  return <SubjectPlanet subject={course.name} index={course.planetStyleIndex} size={size}/>;
}
