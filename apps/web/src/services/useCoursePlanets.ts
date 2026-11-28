import { useCallback, useEffect, useState } from 'react';
import type { PlanetRecord } from '@keling/shared';
import { useAppStore } from '../store/useAppStore';
import { planetAPI, planetError, subscribePlanetChanges } from './planets';
import { getGuestSessionId } from './guestSession';

/** One scoped list for all course cards; mutations and cross-tab focus refresh it. */
export function useCoursePlanets() {
  const { user, isGuest } = useAppStore();
  const scope = isGuest ? `guest:${getGuestSessionId() || ''}` : `account:${user?.id || ''}`;
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{scope:string;byCourse:Record<string,PlanetRecord>;error:string} | null>(null);
  const refresh = useCallback(() => setRevision(value => value + 1), []);
  useEffect(() => {
    let alive = true;
    void planetAPI.list().then(planets => {
      if (alive) setResult({scope,byCourse:Object.fromEntries(planets.map(planet => [planet.courseId,planet])),error:''});
    }).catch(error => { if (alive) setResult({scope,byCourse:{},error:planetError(error)}); });
    return () => { alive = false; };
  }, [scope, revision]);
  useEffect(() => {
    const unsubscribe = subscribePlanetChanges(refresh);
    window.addEventListener('focus', refresh);
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', visible);
    return () => { unsubscribe();window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible); };
  }, [refresh]);
  const current = result?.scope === scope ? result : null;
  return { byCourse:current?.byCourse || {}, loading:!current, error:current?.error || '', refresh };
}
