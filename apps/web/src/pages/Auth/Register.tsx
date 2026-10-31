import { appPath } from '../../services/appPath';
import { StellarScene } from '../../components/StellarScene';
import GuestTrialEntry from '../../components/GuestTrialEntry';
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { motion } from 'framer-motion';
import { Mail, Lock, User } from 'lucide-react';
import './Auth.css';

const Register: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); pending.current = null; }, []);

  const register = useAppStore((state) => state.register);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');

    if (!name.trim() || name.trim().length > 80) {
      setError('名字需为 1–80 个字符');
      return;
    }

    if (password !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    if (password.length < 10 || password.length > 128) {
      setError('密码长度需为 10–128 位');
      return;
    }

    const attempt = new AbortController();
    pending.current = attempt;
    setLoading(true);

    try {
      await register(name, email, password, attempt.signal);
      if (pending.current === attempt && !attempt.signal.aborted) navigate('/');
    } catch (err: any) {
      if (pending.current === attempt) setError(err.message);
    } finally {
      if (pending.current === attempt) { pending.current = null; setLoading(false); }
    }
  };

  return (
    <div className="auth-container">
      <figure className="auth-arrival"><StellarScene scene="register" eager/><figcaption><h1>为好奇心建立坐标</h1><p>创建共享账号，在网页整理思路，在手机延续每一次学习。</p><Link to="/explore">了解课灵 →</Link></figcaption></figure>

      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo */}
        <div className="auth-logo">
          <img className="auth-stellar-logo" src={appPath("/stellar/title_logo.webp")} width="1774" height="887" alt="课灵 KeLing" />
          <p>开启你的星际学习之旅</p>
        </div>

        {/* 表单 */}
        <GuestTrialEntry />

        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message" role="alert">{error}</div>}

          <div className="input-group">
            <User className="input-icon" size={20} />
            <input
              type="text"
              placeholder="你的名字" aria-label="你的名字" autoComplete="name"
              maxLength={80} disabled={loading}
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <Mail className="input-icon" size={20} />
            <input
              type="email"
              placeholder="邮箱地址" aria-label="邮箱地址" autoComplete="email"
              maxLength={254} disabled={loading} autoCapitalize="none" spellCheck={false}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <Lock className="input-icon" size={20} />
            <input
              type="password"
              placeholder="设置密码（10–128 位）" aria-label="设置密码" autoComplete="new-password"
              minLength={10} maxLength={128} disabled={loading}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <Lock className="input-icon" size={20} />
            <input
              type="password"
              placeholder="确认密码" aria-label="确认密码" autoComplete="new-password"
              minLength={10} maxLength={128} disabled={loading}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? '注册中...' : '开始星际之旅'}
          </button>
          {loading && <div role="status">
            <p>正在连接账号服务，最多等待25秒。</p>
            <button type="button" className="auth-btn" onClick={() => pending.current?.abort()}>取消等待</button>
          </div>}
        </form>

        <div className="auth-footer">
          <p>
            已有账号？{' '}
            <Link to="/login">立即登录</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Register;
