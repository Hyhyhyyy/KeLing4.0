import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';
import { appPath } from '../services/appPath';
import './ModuleTitle.css';

export type TitleKind = 'home' | 'ai' | 'voyage' | 'courses' | 'notes' | 'tasks' | 'report' | 'profile' | 'settings';

const mascotCells: Record<TitleKind, number> = {
  home: 0, ai: 1, voyage: 2, courses: 3, notes: 4,
  tasks: 5, report: 6, profile: 7, settings: 8,
};

/** Decorative art is excluded from the accessible name; the adjacent heading carries it. */
export function TitleMascot({ kind }: { kind: TitleKind }) {
  const cell = mascotCells[kind];
  const style: CSSProperties = {
    backgroundImage: `url(${appPath('/stellar/title_mascots.webp')})`,
    backgroundPosition: `${cell % 3 * 50}% ${Math.floor(cell / 3) * 50}%`,
  };
  return <span className="title-mascot" data-title-kind={kind} style={style} aria-hidden="true" />;
}

/** Original 24-unit line drawings, shared in weight and palette with the mascot accessories. */
export function TitleGlyph({ kind = 'home' }: { kind?: TitleKind }) {
  const drawings: Record<TitleKind, ReactNode> = {
    home: <><path d="m12 3 2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z"/><path d="M19 3v4M17 5h4"/></>,
    ai: <><path d="M4 5h16v11H11l-5 4v-4H4Z"/><path d="m12 7 1.1 2.9L16 11l-2.9 1.1L12 15l-1.1-2.9L8 11l2.9-1.1Z"/></>,
    voyage: <><circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/><path d="M12 3v2m0 14v2M3 12h2m14 0h2"/></>,
    courses: <><circle cx="12" cy="12" r="6"/><ellipse cx="12" cy="12" rx="11" ry="3.5" transform="rotate(-25 12 12)"/><path d="M19 3v3m-1.5-1.5h3"/></>,
    notes: <><path d="M4 4h9l3 3v14H4Z"/><path d="M12 4v5h4M7 12h5M7 16h4m5-1 4-10 2 1-4 10-3 2Z"/></>,
    tasks: <><circle cx="12" cy="13" r="8"/><path d="M9 2h6m-3 0v3m6 1 2-2M12 8v5l3 2"/></>,
    report: <><path d="M4 3v17h17M8 16v-4m5 4V8m5 8V5"/><path d="m7 8 5-4 3 1 5-3"/></>,
    profile: <><path d="m12 3 2.3 4.7 5.2.8-3.8 3.7.9 5.2-4.6-2.5-4.6 2.5.9-5.2-3.8-3.7 5.2-.8Z"/><path d="m8 18-1 4 5-2 5 2-1-4"/></>,
    settings: <><path d="M19 3a6 6 0 0 0-7 7L4 18a2.1 2.1 0 0 0 3 3l8-8a6 6 0 0 0 6-8l-4 4-3-3Z"/><path d="m5 19 1-1"/></>,
  };
  return <svg className="title-glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{drawings[kind]}</svg>;
}

type HeadingProps = HTMLAttributes<HTMLHeadingElement> & { kind: TitleKind; as?: 'h1' | 'h2' | 'h3' };

export function ModuleTitle({ kind, as: Heading = 'h1', className = '', children, ...props }: HeadingProps) {
  return <Heading {...props} className={`module-title ${className}`}><TitleMascot kind={kind}/><span className="title-copy">{children}</span></Heading>;
}

export function SectionTitle({ kind, as: Heading = 'h2', className = '', children, ...props }: HeadingProps) {
  return <Heading {...props} className={`section-title-art ${className}`}><TitleGlyph kind={kind}/><span className="title-copy">{children}</span></Heading>;
}
