import { Fragment, useId, type CSSProperties, type ReactNode } from 'react';
import { appPath } from '../services/appPath';
import './NavigationArrow.css';

type Direction = 'right' | 'left' | 'up' | 'down' | 'up-right';
const rotations: Record<Direction, number> = { right: 0, left: 180, up: -90, down: 90, 'up-right': -45 };

export function NavigationArrow({ direction = 'right', size = 40, className = '' }: {
  direction?: Direction; size?: number; className?: string;
}) {
  const style: CSSProperties = { '--arrow-size': `${size}px`, '--arrow-turn': `${rotations[direction]}deg` } as CSSProperties;
  return <img className={`navigation-arrow ${className}`} style={style} src={appPath('/stellar/navigation_arrow.webp')}
    width={size} height={size} alt="" aria-hidden="true" draggable={false} />;
}

export function SelectFrame({ children }: { children: ReactNode }) {
  return <span className="select-arrow-frame">{children}<NavigationArrow direction="down" size={32}/></span>;
}

export function NumberField({ label, value, min, max, onChange, required = false }: {
  label: string; value: number; min: number; max: number; onChange: (value: number) => void; required?: boolean;
}) {
  const id = useId();
  return <div className="number-field"><label htmlFor={id}>{label}</label><div className="number-arrow-frame">
    <input id={id} type="number" min={min} max={max} value={value} required={required} onChange={event => onChange(Number(event.target.value))}/>
    <div className="number-arrow-controls">
      <button type="button" aria-label={`增加${label}`} disabled={value >= max} onClick={() => onChange(Math.min(max, Math.max(min, value + 1)))}><NavigationArrow direction="up" size={32}/></button>
      <button type="button" aria-label={`减少${label}`} disabled={value <= min} onClick={() => onChange(Math.max(min, Math.min(max, value - 1)))}><NavigationArrow direction="down" size={32}/></button>
    </div>
  </div></div>;
}

export function FlowSequence({ items, empty = '' }: { items: readonly string[]; empty?: string }) {
  if (!items.length) return <>{empty}</>;
  return <span className="flow-sequence">{items.map((item, index) => <Fragment key={index}>
    {index > 0 && <><span className="arrow-reading-order">，然后</span><NavigationArrow size={32}/></>}
    <span>{item}</span>
  </Fragment>)}</span>;
}
