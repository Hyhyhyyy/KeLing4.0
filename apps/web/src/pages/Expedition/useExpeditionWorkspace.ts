import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { expeditionError, expeditionSnapshot, refreshExpeditionCourses, subscribeExpedition } from '../../services/expedition';
import { expeditionScopeKey, readExpeditionLocal } from '../../services/expeditionStorage';
import type { ExpeditionLocalState, ExpeditionScope } from '../../services/expeditionStorage';

export function useExpeditionWorkspace() {
  const userId = useAppStore(state => state.user?.id), guest = useAppStore(state => state.isGuest);
  const scope = useMemo<ExpeditionScope | null>(() => userId ? { kind: guest ? 'guest' : 'account', id: userId } : null, [userId, guest]);
  const [local, setLocal] = useState<ExpeditionLocalState | null>(null), [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!scope) return;
    let active = true;
    const read = () => void readExpeditionLocal(scope).then(value => { if (active) setLocal(value); }).catch(value => { if (active) setError(expeditionError(value)); });
    read(); const unsubscribe = subscribeExpedition(key => { if (key === expeditionScopeKey(scope)) read(); });
    void refreshExpeditionCourses(scope).catch(value => { if (active) setNotice('课程列表暂未刷新，已保存的本机资料仍可查看。' + expeditionError(value)); });
    return () => { active = false; unsubscribe(); };
  }, [scope]);
  const perform = useCallback(async (operation: () => Promise<void>) => {
    if (busy) return; setBusy(true); setError(''); setNotice('');
    try { await operation(); } catch (value) { setError(expeditionError(value)); } finally { setBusy(false); }
  }, [busy]);
  const reloadLocal = useCallback(async () => { if (scope) setLocal(await readExpeditionLocal(scope)); }, [scope]);
  const safeLocal = local && scope && local.scope === expeditionScopeKey(scope) ? local : null;
  const snapshot = safeLocal ? expeditionSnapshot(safeLocal) : null;
  const preferences = safeLocal?.preferences || { hints: 'KEY_MOMENTS' as const, narrative: 'LIGHT' as const, reducedMotion: false };
  return { preferences, scope, local: safeLocal, snapshot, error, setError, notice, setNotice, busy, perform, reloadLocal, guest };
}
