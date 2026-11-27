import type { CSSProperties } from 'react';
import catalog from '../../../../assets/stellar/subject-planets.json';
import { appPath } from '../services/appPath';
import { CoursePlanet } from './CoursePlanet';
import { subjectPlanet } from './subjectPlanetCatalog';


export function SubjectPlanet({ subject, index = 0, size = 96 }: { subject: string; index?: number; size?: number }) {
  const item = subjectPlanet(subject);
  if (!item) return <CoursePlanet index={index} size={size} />;
  return <span role="img" aria-label={`${item.name}知识星球`} style={{
    display: 'inline-block', width: size, height: size, flexShrink: 0,
    backgroundImage: `url("${appPath(`/stellar/${catalog.file}`)}")`,
    backgroundSize: `${catalog.columns * 100}% ${catalog.rows * 100}%`,
    backgroundPosition: `${item.column / (catalog.columns - 1) * 100}% ${item.row / (catalog.rows - 1) * 100}%`,
    backgroundRepeat: 'no-repeat', imageRendering: 'auto',
  } as CSSProperties} />;
}
