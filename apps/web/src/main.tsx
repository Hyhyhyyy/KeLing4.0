import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
import { clearLegacyApiCache } from './clearLegacyCache';
void clearLegacyApiCache().catch(() => console.warn('旧API缓存清理失败，请清除站点数据后继续'));
