import type { CSSProperties } from 'react';
import { coursePlanet, coursePlanetIndex, coursePlanets } from './planetCatalog';
import './CoursePlanet.css';

export function CoursePlanet({ index, size = 96, decorative = false }: { index: unknown; size?: number; decorative?: boolean }) {
  const planet = coursePlanet(index);
  return <img key={planet.file} className="course-planet-art" src={`/stellar/${planet.file}`} alt={decorative ? '' : planet.name}
    width={size} height={size} style={{ '--planet-size': `${size}px` } as CSSProperties} decoding="async"
    onError={event => { event.currentTarget.onerror = null; if (!event.currentTarget.src.endsWith('/stellar/app_icon.png')) { event.currentTarget.src = '/stellar/app_icon.png'; event.currentTarget.alt = decorative ? '' : '星球图片暂不可用'; } }} />;
}

export function CoursePlanetPicker({ value, onChange, disabled = false }: { value: unknown; onChange: (index: number) => void; disabled?: boolean }) {
  const selected = coursePlanetIndex(value);
  return <fieldset className="course-planet-picker" disabled={disabled}>
    <legend>星球外观 · {coursePlanets[selected].name}</legend>
    <p>选择一颗喜欢的星球，只更换外观，不改变学科、资料或学习数值。</p>
    <div className="course-planet-options">
      {coursePlanets.map((planet, index) => <button key={planet.file} type="button" className="course-planet-option"
        aria-pressed={selected === index} aria-label={`${planet.name}：${planet.description}`} onClick={() => onChange(index)}>
        <CoursePlanet index={index} size={92} decorative />
        <span>{planet.name}</span><small>{selected === index ? '已选择 ✓' : '选择此星球'}</small>
      </button>)}
    </div>
  </fieldset>;
}
