import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { beginAssistantLaunch } from '../services/assistantLaunch';
import type { ContextRef } from '../services/assistant';
import './AssistantContextPanel.css';

interface Props {
  source: ContextRef;
  prompt: string;
  children?: ReactNode;
  className?: string;
  disabled?: boolean;
  describedBy?: string;
  label?: string;
}

export default function AskAssistantButton({ source, prompt, children, className = '', disabled, describedBy, label }: Props) {
  const accountId = useAppStore(state => state.user?.id);
  const navigate = useNavigate();
  return <button type="button" className={`ask-assistant-button ${className}`} disabled={disabled || !accountId}
    aria-describedby={describedBy} aria-label={label} onClick={() => {
      if (!accountId || disabled) return;
      const key = beginAssistantLaunch(accountId, source, prompt);
      navigate('/ai', { state: { assistantContextEntry: key } });
    }}>{children || '带着资料问 AI'}</button>;
}
