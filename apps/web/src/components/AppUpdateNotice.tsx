import { useEffect, useState } from 'react';
import { appPath } from '../services/appPath';
import { applyAppUpdate, watchAppUpdates, type AvailableAppUpdate } from '../services/appUpdates';
import { useAppStore } from '../store/useAppStore';
import './AppUpdateNotice.css';

export default function AppUpdateNotice() {
  const [update, setUpdate] = useState<AvailableAppUpdate | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isGuest = useAppStore(state => state.isGuest);
  useEffect(() => {
    if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
    const monitor = watchAppUpdates({
      container: navigator.serviceWorker,
      baseURL: new URL(appPath('/'), window.location.origin).href,
      pageURL: window.location.href,
      onAvailable: offer => { setUpdate(offer); setError(''); },
      onError: () => console.warn('页面更新检查暂不可用')
    });
    const check = () => { if (document.visibilityState === 'visible') void monitor.check(); };
    window.addEventListener('focus', check);
    window.addEventListener('online', check);
    document.addEventListener('visibilitychange', check);
    return () => { monitor.dispose(); window.removeEventListener('focus', check); window.removeEventListener('online', check); document.removeEventListener('visibilitychange', check); };
  }, []);
  if (!update) return null;
  const apply = async () => {
    if (busy) return;
    setBusy(true); setError('');
    try { await applyAppUpdate(update, { isGuest, confirm: message => window.confirm(message), reload: () => window.location.reload() }); }
    catch (error) { setError(error instanceof Error ? error.message : '更新暂未就绪，请稍后重试。'); }
    finally { setBusy(false); }
  };
  return <aside className="app-update-notice" aria-label="页面更新">
    <div role="status"><strong>有新版本</strong><p>{isGuest ? '先导出重要内容；刷新会清空游客数据。' : '先保存或导出草稿，再更新页面。'}</p>{error && <p>{error}</p>}</div>
    <div className="app-update-actions"><button disabled={busy} onClick={() => void apply()}>{busy ? '正在更新…' : '更新页面'}</button><button disabled={busy} onClick={() => setUpdate(null)}>稍后</button></div>
  </aside>;
}
