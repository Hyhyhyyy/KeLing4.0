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
  return <img className={`stellar-scene ${className}`} src={appPath(`/stellar/${art.file}.png`)} width={art.width} height={art.height}
    data-scene={scene} data-format={art.width / art.height > 2 ? 'panorama' : 'landscape'}
    alt={decorative ? '' : art.title} loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} decoding="async" />;
}
export function StellarSceneBanner({ scene, eyebrow, title, description, children, compact = false }: {
  scene: StellarSceneName; eyebrow: string; title: string; description: string; children?: ReactNode; compact?: boolean;
}) {
  return <section className={`stellar-scene-banner${compact ? ' scene-banner-compact' : ''}`}><div className="scene-banner-copy"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p>{children}</div><StellarScene scene={scene} decorative /></section>;
}
