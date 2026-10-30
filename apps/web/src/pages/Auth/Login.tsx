import { StellarScene } from '../../components/StellarScene';
import GuestTrialEntry from '../../components/GuestTrialEntry';
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { motion } from 'framer-motion';
import { Mail, Lock } from 'lucide-react';
import './Auth.css';

const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const login = useAppStore((state) => state.login);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <figure className="auth-arrival"><StellarScene scene="login" eager/><figcaption><h1>欢迎回到学习轨道</h1><p>把上一次的思考接着完成，让今天的探索有一个熟悉的起点。</p><Link to="/explore">了解课灵 →</Link></figcaption></figure>

      <motion.div
        className="auth-card"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        {/* Logo */}
        <div className="auth-logo">
          <img className="auth-stellar-logo" src="/stellar/title_logo.png" width="1774" height="887" alt="课灵 KeLing" />
          <p>欢迎回来，星际探索者</p>
        </div>

        <GuestTrialEntry />

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="auth-form">
          {error && <div className="error-message">{error}</div>}

          <div className="input-group">
            <Mail className="input-icon" size={20} />
            <input
              type="email"
              placeholder="邮箱地址" aria-label="邮箱地址" autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="input-group">
            <Lock className="input-icon" size={20} />
            <input
              type="password"
              placeholder="密码" aria-label="密码" autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button type="submit" className="auth-btn" disabled={loading}>
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            还没有账号？{' '}
            <Link to="/register">立即注册</Link>
          </p>
        </div>
      </motion.div>
    </div>
  );
};

export default Login;
