import { ModuleTitle, SectionTitle, type TitleKind } from './ModuleTitle';
import { appPath } from '../services/appPath';
import type { ReactNode } from 'react';
import { stellarScenes } from './stellarScenes';
import type { StellarSceneName } from './stellarScenes';
import './StellarScene.css';
export type { StellarSceneName } from './stellarScenes';
export function StellarScene({ scene, className = '', eager = false, decorative = false }: {
  scene: StellarSceneName; className?: string; eager?: boolean; decorative?: boolean;
}) {
  const art = stellarScenes[scene];
  return <img className={`stellar-scene ${className}`} src={appPath(`/stellar/${art.file}.webp`)} width={art.width} height={art.height}
    data-scene={scene} data-format={art.width / art.height > 2 ? 'panorama' : 'landscape'}
    alt={decorative ? '' : art.title} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} decoding="async" />;
}
export function StellarSceneBanner({ scene, eyebrow, title, description, children, compact = false, mascot = false }: {
  scene: StellarSceneName; eyebrow?: string; title: string; description?: string; children?: ReactNode; compact?: boolean; mascot?: boolean;
}) {
  const kinds: Partial<Record<StellarSceneName, TitleKind>> = { garden: 'courses', courseDetail: 'courses', graph: 'courses', focus: 'tasks', profile: 'profile', report: 'report', achievements: 'profile', settings: 'settings', atlas: 'home' };
  const kind = kinds[scene] || 'home';
  return <section className={`stellar-scene-banner${compact ? ' scene-banner-compact' : ''}`}><div className="scene-banner-copy">{eyebrow && <span className="eyebrow">{eyebrow}</span>}{mascot ? <ModuleTitle kind={kind} as="h2">{title}</ModuleTitle> : <SectionTitle kind={kind}>{title}</SectionTitle>}{description && <p>{description}</p>}{children}</div><StellarScene scene={scene} decorative /></section>;
}
