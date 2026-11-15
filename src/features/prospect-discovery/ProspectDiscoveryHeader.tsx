import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, InlineNotification, CarbonIcons } from '@/design-system';
import { getSupabaseClient } from '@/lib/supabase';

interface ProspectDiscoveryHeaderProps {
  title: string;
  description: string;
  children?: ReactNode;
  showRecentTasks?: boolean;
}

/** Header actions scoped to the Prospect Discovery module. */
export function ProspectDiscoveryHeader({
  title,
  description,
  children,
  showRecentTasks = true,
}: ProspectDiscoveryHeaderProps) {
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState('');

  const signOut = async () => {
    setSigningOut(true);
    setError('');
    try {
      const client = await getSupabaseClient();
      const { error: signOutError } = await client.auth.signOut();
      if (signOutError) throw signOutError;
      navigate('/login', { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '退出登录失败');
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <header className="tp-discovery__heading">
        <div>
          <p className="tp-discovery__eyebrow">TRADEPILOT / PROSPECTING</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="tp-discovery__heading-actions">
          {children}
          {title !== '潜客控制台' && (
            <Button kind="ghost" size="sm" onClick={() => navigate('/prospect-console')}>
              <CarbonIcons.ChartLine size={16} aria-hidden="true" />
              潜客控制台
            </Button>
          )}
          {showRecentTasks && (
            <Button kind="ghost" size="sm" onClick={() => navigate('/recent-tasks')}>
              <CarbonIcons.Time size={16} aria-hidden="true" />
              最近任务
            </Button>
          )}
          <Button kind="ghost" size="sm" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut ? '正在退出…' : '退出登录'}
          </Button>
        </div>
      </header>
      {error && <InlineNotification kind="error" lowContrast title="退出登录失败" subtitle={error} onCloseButtonClick={() => setError('')} />}
    </>
  );
}
