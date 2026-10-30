import { Link } from 'react-router-dom';
import './GuestTrialEntry.css';

export default function GuestTrialEntry() {
  return <section className="guest-trial-entry" aria-label="游客试用入口">
    <Link to="/trial">游客试用 · 无需登录 <span aria-hidden="true">→</span></Link>
    <p>进入完整应用，使用全部学习模块；数据仅在本次内存中，刷新、关闭或退出即清空。AI 需要有效模型配置。</p>
  </section>;
}
