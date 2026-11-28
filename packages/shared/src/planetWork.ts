export type PlanetWorkKind = 'planet' | 'artwork' | 'question' | 'similar';
export type PlanetWorkStepId = 'research' | 'compose' | 'review' | 'visual_prepare' | 'artwork' | 'finalize';
export type PlanetWorkState = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
export type PlanetWorkActivity = 'searching' | 'drafting' | 'validating' | 'reviewing' | 'repairing' | 'visual_search' | 'visual_design' | 'visual_reference' | 'rendering' | 'packaging' | 'reusing_evidence' | 'ready' | 'unavailable';
export interface PlanetWorkStep {
  id: PlanetWorkStepId;
  state: PlanetWorkState;
  activity?: PlanetWorkActivity;
  startedAt?: string;
  finishedAt?: string;
}
export interface PlanetWorkProgress {
  kind: PlanetWorkKind;
  revision: number;
  startedAt: string;
  updatedAt: string;
  steps: PlanetWorkStep[];
}

/** Ignores unknown or malformed progress without affecting the signed learning draft. */
export function parsePlanetWorkProgress(value: unknown): PlanetWorkProgress | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const p = value as Record<string, unknown>;
  const kinds = ['planet', 'artwork', 'question', 'similar'];
  const ids = ['research', 'compose', 'review', 'visual_prepare', 'artwork', 'finalize'];
  const states = ['pending', 'running', 'completed', 'failed', 'skipped'];
  const activities = ['searching', 'drafting', 'validating', 'reviewing', 'repairing', 'visual_search', 'visual_design', 'visual_reference', 'rendering', 'packaging', 'reusing_evidence', 'ready', 'unavailable'];
  const date = (v: unknown): v is string => typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
  if (!kinds.includes(p.kind as string) || !Number.isSafeInteger(p.revision) || (p.revision as number) < 0 || !date(p.startedAt) || !date(p.updatedAt) || !Array.isArray(p.steps) || p.steps.length < 1 || p.steps.length > ids.length) return undefined;
  const seen = new Set<string>();
  const steps: PlanetWorkStep[] = [];
  for (const value of p.steps) {
    if (!value || typeof value !== 'object') return undefined;
    const step = value as Record<string, unknown>;
    if (!ids.includes(step.id as string) || seen.has(step.id as string) || !states.includes(step.state as string) || (step.activity !== undefined && !activities.includes(step.activity as string)) || (step.startedAt !== undefined && !date(step.startedAt)) || (step.finishedAt !== undefined && !date(step.finishedAt))) return undefined;
    seen.add(step.id as string);
    steps.push({ id: step.id as PlanetWorkStepId, state: step.state as PlanetWorkState, ...(step.activity === undefined ? {} : { activity: step.activity as PlanetWorkActivity }), ...(step.startedAt === undefined ? {} : { startedAt: step.startedAt as string }), ...(step.finishedAt === undefined ? {} : { finishedAt: step.finishedAt as string }) });
  }
  return { kind: p.kind as PlanetWorkKind, revision: p.revision as number, startedAt: p.startedAt, updatedAt: p.updatedAt, steps };
}
