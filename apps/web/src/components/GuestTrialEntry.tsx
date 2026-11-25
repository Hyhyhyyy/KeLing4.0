import { Link } from 'react-router-dom';
import './GuestTrialEntry.css';

export default function GuestTrialEntry() {
  return <section className="guest-trial-entry" aria-label="游客试用入口">
    <Link to="/trial">游客试用 <span aria-hidden="true">→</span></Link>
    <p>刷新或退出后清空</p>
  </section>;
}
